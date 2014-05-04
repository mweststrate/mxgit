var fs = require('fs-extra');
var child_process = require('child_process');

var MENDIX_CACHE = '.mendix-cache/';
var BASE_DATA = MENDIX_CACHE + 'base_data';
var BASE_REV = MENDIX_CACHE + 'base_rev';
var BASE_VER = MENDIX_CACHE + 'base_ver';

var BOGUS_REPO = "https://teamserver.sprintr.com/this_is_not_a_svn_repo_use_git/trunk";
var MERGE_MARKER = "modeler-merge-marker;"

var mprName = findMprFile();

function main() {

	console.log("mxgit: using mpr " + mprName);
	seq([

		async(checkGitDir),
		checkSvnDir,
		async(checkMprLock),
		async(checkMergeMarker),
		initializeSvnDir,
		async(createCacheDir),


//SVN conflict: conflict_old in ACTUAL_NODE: mpr.merge-left.r# (BASE), conflict_new: mpr.merge-right.r# (THEIRS)
//modeler-merge-marker appears as soon as the file is merged by the modeler, but still has conflicts. Disappears as soon as last conflict is resolved in the modeler.

	//TODO: setup gitignore if it doesn't exist (modeler-merge-marker, *.lock, *.svn, *.mendix-cache..., )
	//TODO: setup sprintr id if it doensn't exist, store in NODES or ACTUAL_NODE table...

	//fix wc.db database; update NODES table, set local_relpath to mprname where local_relpath = GitBasedTeamserverRepo.mpr
	//TODO: check if base file has changed, if so, warn
		//store rev file (2) if not available in base_rev
	//extract and store version of baseblob file in base_ver

	//detect tree conflict?
	//find marker?
	//
	////todo: switch to non-real projectid & ts dir
//todo: initiate all the default git ignore stuff
//todo: delete original .svn dir
//todo: ask and store sprintr project id
//todo: check if hash of base hash changed, if so: say reload in modeler
//todo: forward any git commands?
//todo: register git hooks
//
		updateBase,
		processGitConflict

	], function(err) {
		if (err) {
			console.log("mxgit: failed");
			console.error(err);
			process.exit(1);
		}
		else
			console.log("mxgit: done");
	});

}

function createCacheDir() {
	console.log("mxgit: create Mendix cache dir");
	if (!fs.existsSync(MENDIX_CACHE))
		fs.mkdirsSync(MENDIX_CACHE);
}

function checkGitDir() {
	console.log("mxgit: check git repo existence");
	if (!fs.existsSync(".git")) {
		console.error("Please run mxgit from a git directory");
		process.exit(7);
	}
}

function checkMprLock() {
	console.log("mxgit: check mpr lock");
	if (fs.existsSync(mprName + ".lock")) {
		console.error("The file '" + mprName + "' is currently being edited in the Mendix Business Modeler. Please close the project (or remove the lock file)");
		process.exit(9);
	}
}

function checkMergeMarker() {
	console.log("mxgit: check merge marker");
	if (fs.existsSync(MERGE_MARKER)) {
		console.error("The file '" + mprName + "' is currently being merged by the Mendix Business Modeler. Please resolve any model conflicts first.");
		process.exit(10);
	}
}

function checkSvnDir(callback) {
	console.log("mxgit: check svn repository");
	if (fs.existsSync(".svn")) {
		execSvnQuery("select root from REPOSITORY", function(results) {
			if (results[0].trim() == BOGUS_REPO)
				callback();
			else {
				console.error("This repository is currently managed by SVN / Mendix Teamserver. Please remove the current .svn directory before managing the repo with (mx)git. Repo: " + results[0]);
				process.exit(8);
			}
		});
	}
	else
		callback();
}

function initializeSvnDir(callback) {
	if (!fs.existsSync(".svn")) {
		console.log("mxgit: initialize dummy svn repository");
		fs.copySync(__dirname + "/dummysvn/.svn", process.cwd() + "/.svn");
		execSvnQuery(
			"update NODES set local_relpath = '" + mprName + "' where local_relpath = 'GitBasedTeamserverRepo.mpr'",
			function() {
				callback();
			}
		);
	}
	else
		callback();
}

function findMprFile() {
	var files = fs.readdirSync(process.cwd());
	for(var i = 0; i < files.length; i++)
		if (files[i].match(/\.mpr$/))
			return files[i];

	console.error("No .mpr file found in current working directory");
	process.exit(2);
}

function getMprMendixVersion(callback) {
	execMprQuery("select _ProductVersion from _MetaData", function(lines) {
		callback(lines[0]);
	});
}

function updateBase(callback) {
	console.log("mxgit: updating base data");
	findLatestMprHash(function(latestHash) {
		console.log("mxgit: setting base to " + latestHash);

		getMprMendixVersion(function(version) {
			console.log("mxgit: using Mendix version " + version);
			fs.writeFileSync(BASE_VER, version);
			fs.writeFileSync(BASE_REV, '2');

			if (fs.existsSync(BASE_DATA))
				fs.removeSync(BASE_DATA);

			if (latestHash == null) {
				fs.copy(mprName, BASE_DATA, callback);
				console.log("copied");
			}
			else
				storeBlobToFile(latestHash, BASE_DATA, callback);
		});
	});
}

function findLatestMprHash(callback) {
	execGitCommand("ls-tree HEAD", function(treeFiles) {
		for(var i = 0; i < treeFiles.length; i++)
			if (treeFiles[i].indexOf(mprName) != -1) {
				callback(treeFiles[i].split(/\s+/)[2]);
				return;
			}

		callback(null);
	});
}

function processGitConflict(callback) {
	console.log("mxgit: detecting conflict status");
	execGitCommand("diff --name-only --diff-filter=U", function(unmergedFiles) {
		var hasConflict = false;

		for(var i = 0; i < unmergedFiles.length; i++)
			if (unmergedFiles[i] == mprName)
				hasConflict = true;

		if (hasConflict)
			writeConflictData(callback);
		else
			callback();
	});
}

function writeConflictData(callback) {
	console.log("mxgit: conflict detected, updating SVN repository")
	execGitCommand("ls-files -u " + mprName, function(mergestatus) {
		if (mergestatus.length < 3)
			callback("mxgit: cannot handle the current conflict, please use an external tool");
		else {
			var baseblob = mergestatus[0].split(/\s+/)[1];
			var theirsblob = mergestatus[2].split(/\s+/)[1];

			seq([

			    curry(storeBlobToFile, baseblob, mprName + ".left"),
			    curry(storyBlobToFile, theirsblob, mprName + ".right"),
			    curry(execSvnQuery, "delete from ACTUAL_NODE where local_relpath = '" + mprName + "'"),
			    curry(execSvnQuery, "insert into ACTUAL_NODE (local_relpath, conflict_old, conflict_new) values ('"+ mprName +"','"+ mprName +".left','"+ mprName +".right')"),
			    function(callback) {
			    	console.log("mxgit: wrote conflicting files");
			    	callback();
			    }
			]);
		}
	});
}

function storeBlobToFile(hash, filename, callback) {
	out = fs.openSync(filename, 'w');
	var child = child_process.spawn("git", ["cat-file", "-p", hash], {
		stdio: ['pipe', out, 'pipe']
	});

	child.on('close', function() {
		console.log("mxgit: stored " + hash + " -> " + filename);
		callback();
	});
};

if ((typeof (module) !== "undefined" && !module.parent))
	main();


/**
 *
 * Section: utility functions to invoke git, svn or mpr updates
 *
 */

function execSvnQuery(query, callback) {
	execCommand(__dirname + "/sqlite3 .svn/wc.db \"" + query + "\"", callback); //TODO: fix escaping
}

function execMprQuery(query, callback) {
	execCommand(__dirname + "/sqlite3 " + mprName + " \"" + query + "\"", callback); //TODO: fix escaping
}

function execGitCommand(command, callback) {
	execCommand("git " + command, callback);
}

function execCommand(command, callback) {
	child_process.exec(command, function(error, stdout, stderr){
		if (error) {
			console.error("Failed to execute: git " + command);
			console.error(error);
			process.exit(error.code);
		}
		callback(stdout.split(/\r?\n/));
	});
}


/**
 *
 * Section: utility methods for asynchronous function calls.
 * (of course, a lib like 'async' could be used for this,
 * but I wrote it as small attempt to remember what those
 * libs actually do)
 *
 */



function seq(funcs /* [func(callback(err, res), prevresult)] */, callback /*optional func(err, res)) */) {

	function next(f, prevResult) {
		if (f == null) {
			if (callback)
				callback(null, prevResult);
		}
		else {
			//F needs try catch?
			f(function(err, result) {
				if (err) {
					if (callback)
						callback(err, null)
					else
						throw err;
				}
				else
					next(funcs.shift(), result);
			}, prevResult);
		}
	}

	next(funcs.shift(), null);
}

function async(func) {
	return function(callback, prevResult) {
		try {
			callback(null, func(prevResult));
		}
		catch(e) {
			callback(e, null);
		}
	}
}

function curry(func/*, args*/) {
	var cargs = [];
	for(var i = 0; i < arguments.length -1; i++)
		cargs[i] = arguments[i + 1];

	return function() {
		var args = [].concat(cargs).concat(arguments);
		func.apply(null, args);
	}
}