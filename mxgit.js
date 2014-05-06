#! /usr/bin/env node
/**
	MXGIT - utility to manage Mendix projects with git
	https://github.com/mweststrate/mxgit
	
	Author: Michel Weststrate <mweststrate@gmail.com>
	© 2014, MIT Licensed
*/

var fs = require('fs-extra');
var child_process = require('child_process');

var MENDIX_CACHE = '.mendix-cache/';
var BASE_DATA = MENDIX_CACHE + 'base_data';
var BASE_REV = MENDIX_CACHE + 'base_rev';
var BASE_REV_GIT = MENDIX_CACHE + 'base_rev_git';
var BASE_VER = MENDIX_CACHE + 'base_ver';
var FILE_OPTS = { encoding : 'utf-8' };

var BOGUS_REPO = "https://teamserver.sprintr.com/this_is_not_a_svn_repo_use_git/trunk";
var MERGE_MARKER = "modeler-merge-marker;"

var mprName = findMprFile();
var requiresModelerReload = false;
var ignoreMprLock = false;

//todo: register git hooks
//pre commit: check merge marker, check lock. 
//http://stackoverflow.com/a/4185449
//post commit, checkout, merge: do the normal thing (but do not install hooks, do not abort on lock)
//
//todo reset:remove .svn .mendix-cache, hooks
//todo: info / debug statements
//todo: npm package
//todo: test on linux
//todo: test merge stuff
//todo: run npm publish

function main() {
	var yargs = require('yargs')
		.usage("mxgit: utility that aids versioning Mendix projects in git repositories\n" +
			"See https://github.com/mweststrate/mxgit for the full documentation\n" +
			"Copyright by Michel Weststrate<mweststrate@gmail.com> 2014. MIT Licensed\n" +
			"\nBasic usage: 'mxgit -> creates or updates a local SVN working copy with the HEAD state of the git repo in this directory.")
		.describe('install', 'Creates git hooks so that the mxgit çommand no longer needs to be invoked manually. ')
		.describe('reset', 'Removes the local SVN working copy and git hooks.')
		.describe('setprojectid', '<projectid> Sets the Mendix projectid. Use this if you want story and cloud integration in the Mendix Business Modeler')
		.describe('precommit', 'Determines whether the Mendix model can be commit safely')
		.describe('postupdate', 'Same as no arguments, but ignores the model lock')
		.describe('v', 'Verbose')
		.describe('help', 'Prints this help')
		.boolean(["install", "reset", "precommit", "postcommit", "v", "help"])
		.string(["setprojectid"]);

	var params = yargs.argv;
	if (params.help) {
		yargs.showHelp();
		process.exit(0);
	}

	console.log("mxgit: using mpr " + mprName);

	seq([
		async(checkGitDir),
		checkSvnDir,
		initializeSvnDir, 
		async(createCacheDir),
		curry(interpretParams, params)	
	], function(err) {
		if (err) {
			console.log("mxgit: failed");
			console.error(err);
			process.exit(1);
		}
		else {
			console.log("mxgit: done");
			if (requiresModelerReload)
				console.log("\n>>> PLEASE CLOSE AND RE-OPEN THE MODEL IN THE MODELER <<<\n")
		}
	});
}

function interpretParams(params, callback) {
	if (params.reset) {
		reset(callback);
	}
	else if (params.setprojectid) {
		updateSprintrProjectId(callback);
	} 
	else if (params.install) {
		seq([
			initializeGitIgnore, 
			installGitHooks
		], callback);
	}
	else if (params.precommit) {
		checkMprLock();
		checkMergeMarker();
		callback();
	}
	else if (params.postupdate) {
		ignoreMprLock = true;
		updateStatus(callback);
	}
	else {
		updateStatus(callback);
	}
}

function printHelp() {
	//TODO:
}

function installGitHooks(callback) {
	//TODO:	
}

function reset(callback) {

}

function updateStatus(callback) {
	seq([
		async(checkMprLock),
		async(checkMergeMarker),
		initializeGitIgnore,
		updateBase,
		when(hasGitConflict, writeConflictData)
	], callback);
}

function createCacheDir() {
	console.log("mxgit: create Mendix cache dir");
	/* cache dir is used internally by the modeler to store version control meta data */
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

function initializeGitIgnore(callback) {

	var current = [];
	var changed = false;
	if (fs.existsSync(".gitignore"))
		current = fs.readFileSync(".gitignore", FILE_OPTS).split(/\r?\n/);

	var needed = [
		"/.svn",
		"/modeler-merge-marker",
		"/.mendix-cache",
		"/*.mpr.lock",
		"/*.mpr.bak",
		"/*.mpr.left*",
		"/*.mpr.right*",
		"/.settings",
		"/deployment",
		"/releases",
		"proxies",
		"/*.launch",
		"/.classpath",
		"/.project",
	];

	for(var i = 0; i < needed.length; i++) {
		if (-1 == current.indexOf(needed[i])) {
			changed = true;
			current.push(needed[i]);
		}
	}

	if (changed)
		fs.writeFileSync(".gitignore", current.join("\n"), FILE_OPTS);

	callback();
}

function checkMprLock() {
	console.log("mxgit: check mpr lock");
	/* a lock file exists as long as the mpr is opened in a modeler (or if the modeler didn't exit cleanly */
	if (fs.existsSync(mprName + ".lock")) {
		if (ignoreMprLock) {
			console.warn("The file '" + mprName + "' is currently being edited in the Mendix Business Modeler.");
			requiresModelerReload = true;
		}
		else {
			console.error("The file '" + mprName + "' is currently being edited in the Mendix Business Modeler. Please close the project (or remove the lock file)");
			process.exit(9);
		}
	}
}

function checkMergeMarker() {
	console.log("mxgit: check merge marker");
	/* merge marker exists if as soon as the modeler has picked up a merge conflict, and created a new mpr from that. It disappears as soon as the model has no conflicts anymore, to indicate that the conflict has been resolved (which should be communicated to git by using a git add command) */
	if (fs.existsSync(MERGE_MARKER)) {
		console.error("The file '" + mprName + "' is currently being merged by the Mendix Business Modeler. Please resolve any model conflicts first.");
		process.exit(10);
	}
}

function checkSvnDir(callback) {
	console.log("mxgit: check svn repository");
	/* svn dir shouldn't exists, or it should be our dummy repository */
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
		/* the dummy repository is there to trick the modeler into thinking this project is properly versioned. We need to alter the actual db though to use the correct name of the mpr file, which might differ per project */
		fs.copySync(__dirname + "/dummysvn/.svn", process.cwd() + "/.svn");
		execSvnQuery(
			"update NODES set local_relpath = '" + mprName + "' where local_relpath = 'GitBasedTeamserverRepo.mpr'",
			function() {
					////todo: switch to non-real projectid & ts dir

				callback();
			}
		);
	}
	else
		callback();
}

function updateSprintrProjectId(callback) {
	//TODO: setup sprintr id if it doensn't exist and the flag is provided, store in NODES or ACTUAL_NODE table...
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
			fs.writeFileSync(BASE_VER, version, FILE_OPTS);
			fs.writeFileSync(BASE_REV, "2", FILE_OPTS); //TODO: or use -1?

			if(latestHash != null && fs.existsSync(BASE_REV_GIT) && latestHash == fs.readFileSync(BASE_REV_GIT, FILE_OPTS)) {
				callback();
			} 
			else {
				requiresModelerReload = true;
				fs.writeFileSync(BASE_REV_GIT, latestHash, FILE_OPTS);

				if (fs.existsSync(BASE_DATA))
					fs.removeSync(BASE_DATA);

				if (latestHash == null) {
					fs.copy(mprName, BASE_DATA, callback);
					console.log("copied");
				}
				else
					storeBlobToFile(latestHash, BASE_DATA, callback);
			}
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

function hasGitConflict(callback) {
	console.log("mxgit: detecting conflict status");
	execGitCommand("diff --name-only --diff-filter=U", function(unmergedFiles) {
		callback(null, unmergedFiles.indexOf(mprName) != -1)
	});
}

function writeConflictData(callback) {
	console.log("mxgit: conflict detected, updating SVN repository")
	requiresModelerReload = true;

	/* A SVN conflict is stored as follows: 
	conflict_old column in ACTUAL_NODE table: mpr.merge-left.r# (BASE), conflict_new column: mpr.merge-right.r# (THEIRS)
	modeler-merge-marker appears as soon as the file is merged by the modeler, but still has conflicts. Disappears as soon as last conflict is resolved in the modeler. */

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
	execSqliteQuery(".svn/wc.db", query, callback);
}

function execMprQuery(query, callback) {
	execSqliteQuery(mprName, query, callback);
}

function execSqliteQuery(file, query, callback) {
	var sqlite = process.platform == 'win32' ? __dirname + "/sqlite3" : "sqlite3";
	var query = query.replace(/[\\\"]/g, function(r) { return "\\" + r; });

	execCommand([sqlite, file, "\"" + query + "\""].join(" "), callback);
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
	//TODO: rename to sequence, do not use prevResult
	function next(f, prevResult) {
		if (f == null) {
			if (callback)
				callback(null, prevResult);
		}
		else {
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

function when(condfunc, whenfunc /*or array*/, elsefunc /*optional, or array*/) {
	function wrapSequence(func) {
		if (Array.isArray(func)) {
			return curry(seq, func); //how convenient
		}
		else
			return func;
	}

	return function(callback) {
		confunc(function(conditionResult) {
			if (conditionResult)
				wrapSequence(whenfunc)(callback);
			else {
				if (elsefunc)
					wrapSequence(elsefunc)(callback);
				else
					callback();
			}
		});
	}
}

//todo: rename to makeAsync
function async(func) {
	return function(callback, prevResult) {
		callback(null, func(prevResult));
	}
}

function identity(value) {
	return function(callback) {
		callback(null, value);
	}
}

//todo: rename to partial
function curry(func/*, args*/) {
	var cargs = [];
	var scope = this;

	for(var i = 0; i < arguments.length -1; i++) //TODO: use concat + splice!
		cargs[i] = arguments[i + 1];

	return function() {
		var args = [].concat(cargs).concat(arguments);
		return func.apply(scope, args);
	}
}