var fs = require('fs-extra'); 
var child_process = require('child_process');

var MENDIX_CACHE = '.mendix-cache/';
var BASE_DATA = MENDIX_CACHE + 'base_data';
var BOGUS_REPO = "https://teamserver.sprintr.com/this_is_not_a_svn_repo_use_git/trunk";

var mprName = findMprFile();

function main() {

	console.log("mxgit: using mpr " + mprName);
	seq([

		async(checkGitDir),
		checkSvnDir,
		initializeSvnDir,
		async(createCacheDir),
	//TODO: setup gitignore if it doesn't exist
	//TODO: setup sprintr id if it doensn't exist, store in NODES or ACTUAL_NODE table...
		updateBase

	//fix wc.db database; update NODES table, set local_relpath to mprname where local_relpath = GitBasedTeamserverRepo.mpr
	//TODO: check if base file has changed, if so, warn
		//store rev file (2) if not available in base_rev
	//extract and store version of baseblob file in base_ver

	//detect tree conflict?
	//find marker?

	], function(err) {
		if (err) {
			console.error(err);
			process.exit(1);
		}
	});

}

function createCacheDir() {
	//create cache dir if it doesn't exist
	if (!fs.existsSync(MENDIX_CACHE))
		fs.mkdirsSync(MENDIX_CACHE);
}

function checkGitDir() {
	if (!fs.existsSync(".git")) {
		console.error("Please run mxgit from a git directory");
		process.exit(7);
	}
}

function checkSvnDir(callback) {
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
		fs.copySync(__dirname + "/dummysvn/.svn", process.cwd() + "/.svn");
		execSvnQuery(
			"update NODES set local_relpath = '" + mprName + "' where local_relpath = 'GitBasedTeamserverRepo.mpr'",
			callback
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

function updateBase(callback) {
	findLatestMprHash(function(latestHash) {
		console.log("mxgit: setting base to " + latestHash);
		if (fs.existsSync(BASE_DATA))
			fs.removeSync(BASE_DATA);
		if (latestHash == null) {
			fs.copy(mprName, BASE_DATA, callback);
			console.log("copied");
		}
		else
			storeBlobToFile(latestHash, BASE_DATA, callback);
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

//todo: switch to non-real projectid & ts dir
//todo: initiate all the default git ignore stuff
//todo: delete original .svn dir
//todo: ask and store sprintr project id
//todo: check if hash of base hash changed, if so: say reload in modeler
//todo: forward any git commands?


function resolve() {
	var mprName = findMprName();
	
	//check marker for three conflict?

	//git add
	//git commit
	up();


}

function execSvnQuery(query, callback) {
	execCommand(__dirname + "/sqlite3 .svn/wc.db \"" + query + "\"", callback); //TODO: fix escaping
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

function storeBlobToFile(hash, filename, callback) {
	out = fs.openSync(filename, 'w');
	var child = child_process.spawn("git", ["cat-file", "-p", hash], {
		stdio: ['pipe', out, 'pipe']
	});

	child.on('close', function() {
		console.log("stored " + hash + " -> " + filename);
		callback();
	});
};

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

if ((typeof (module) !== "undefined" && !module.parent))
	main();
