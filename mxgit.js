#!/usr/bin/env node

/**
	MXGIT - utility to manage Mendix projects with git
	https://github.com/mweststrate/mxgit

	Author: Michel Weststrate <mweststrate@gmail.com>
	© 2014, MIT Licensed
*/

//V1.1:
//support in-modeler update so that it is less often required to reopen the repo
//see other known issues.

/* dependencies */
var fs = require('fs-extra'); //https://github.com/jprichardson/node-fs-extra
var child_process = require('child_process');

/* constants */
var MENDIX_CACHE = '.mendix-cache/';
var BASE_DATA = MENDIX_CACHE + 'base_data';
var BASE_REV = MENDIX_CACHE + 'base_rev';
var BASE_REV_GIT = MENDIX_CACHE + 'base_rev_git';
var BASE_VER = MENDIX_CACHE + 'base_ver';
var FILE_OPTS = { encoding : 'utf-8' };

var BOGUS_REPO = "https://teamserver.sprintr.com/this_is_not_a_svn_repo_use_git/trunk";
var MERGE_MARKER = "modeler-merge-marker";

/* state */
var mprName = findMprFile();
var requiresModelerReload = false;
var ignoreMprLock = false;
var verbose = false;
var lastInfoMsg;

function main() {
	var yargs = require('yargs')
		.usage("mxgit: Small tool that helps versioning Mendix projects with git\n" +
			"See https://github.com/mweststrate/mxgit for the full documentation\n" +
			"Copyright by Michel Weststrate<mweststrate@gmail.com> 2014. MIT Licensed\n" +
			"\nBasic usage: 'mxgit -> creates or updates a local SVN working copy with the HEAD state of the git repo in this directory." +
			"\nBasic usage: 'mxgit --install -> makes sure that mxgit is run automatically after every git command")
		.describe('install', 'Creates git hooks so that the mxgit çommand no longer needs to be invoked manually. ')
		.describe('reset', 'Removes the local SVN working copy and git hooks.')
		.describe('setprojectid', '<projectid> Sets the Mendix projectid. Use this if you want story and cloud integration in the Mendix Business Modeler')
		.describe('precommit', 'Determines whether the Mendix model can be commit safely')
		.describe('postupdate', 'Same as no arguments, but ignores the model lock')
		.describe('merge', 'Used internally as git driver. Takes temporarily files as argument: <base> <mine> <theirs>')
		.describe('v', 'Verbose')
		.describe('help', 'Prints this help')
		.boolean(["install", "reset", "precommit", "postcommit", "v", "help", "merge"])
		.string(["setprojectid"]);

	var params = yargs.argv;
	if (params.help) {
		yargs.showHelp();
		process.exit(0);
	}
	verbose = params.v;

	info("using " + mprName);

	seq([
		makeAsync(checkGitDir),
		checkSvnDir,
		initializeSvnDir,
		makeAsync(createCacheDir),
		partial(interpretParams, params)
	], function(err) {
		if (err) {
			console.info(err);
			info("[ERROR] aborted.");
			process.exit(1);
		}
		else {
			if (requiresModelerReload)
				console.info("\n>>> PLEASE REOPEN THE MODEL IN THE MENDIX BUSINESS MODELER <<<\n");
			else
				info("done.");
		}
	});
}

function interpretParams(params, callback) {
	if (params.reset) {
		reset(callback);
	}
	else if (params.setprojectid) {
		updateSprintrProjectId(params.setprojectid, callback);
	}
	else if (params.install) {
		seq([
			initializeGitIgnore,
			installGitHooks,
			installMergeDriver,
			updateStatus
		], callback);
	}
	else if (params.precommit) {
		checkMergeMarker();
		checkMprLock();
		callback();
	}
	else if (params.postupdate) {
		ignoreMprLock = true;
		updateStatus(callback);
	}
	else if (params.merge) {
		gitMergeDrive(params._);
	}
	else {
		updateStatus(callback);
	}
}

function installGitHooks(callback) {
	function writeGitHook(name, command) {
		var filename = ".git/hooks/" + name;
		if (fs.existsSync(filename))
			console.info("The git hook '" + filename + "' already exists! Skipping.");
		else {
			fs.writeFileSync(filename, "#!/bin/sh\n#mxgit-marker-hook\necho 'git -> mxgit: running hook " + name + "'\nexec mxgit --" + command, FILE_OPTS);
			if (process.platform != 'win32')
				fs.chmodSync(filename, 0755 /*octal!*/) ;
		}
	}

	//http://git-scm.com/book/en/Customizing-Git-Git-Hooks
	//http://stackoverflow.com/a/4185449
	//TODO: or use filter for .mpr file that as side effect runs update? that is less of a hassle with existing hooks
	var hooks = {
		"pre-commit" : "precommit",
		"post-commit" : "postupdate",
		"post-update" : "postupdate",
		"post-checkout" : "postupdate",
		"post-merge" : "postupdate"
	};

	info("setting up git hooks...");
	for (var hook in hooks) {
		writeGitHook(hook, hooks[hook]);
	}

	done();
	callback();
}

function installMergeDriver(callback) {
	info("setting up merge driver for .mpr files...");
	/*
	.git/info/attributes instead of .gitattributes,
	so that the attributes are not stored in the repo, since others might not be using mxgit
	*/
	updateConfigFile(".git/info/attributes",["/*.mpr merge=mxgit"]);

	/*
	[merge "mxgit"]
		name = mxgit merge driver for mpr's
		driver = mxgit --merge %O %A %B
		recursive = binary
	*/
	updateConfigFile(".git/config", [
		"[merge \"mxgit\"]\n\tname = mxgit merge driver for mpr files\n\tdriver = mxgit --merge %O %A %B"
	]);

	done();
	callback();
}

function reset(callback) {
	info("resetting. Removing all traces of mxgit...");

	//check which hooks are ours
	var toRemove = [
		".git/hooks/pre-commit",
		".git/hooks/post-update",
		".git/hooks/post-commit",
		".git/hooks/post-checkout",
		".git/hooks/post-merge"
	].filter(function(hook) {
		return fs.existsSync(hook) && fs.readFileSync(hook, FILE_OPTS).indexOf("#mxgit-marker-hook") != -1;
	});

	//remove SVN related dirs
	toRemove.concat([
		MENDIX_CACHE,
		".svn"
	]).map(function(thing) {
		fs.removeSync(thing);
	});

	//clean altered config files
	[
		".gitignore",
		".git/config",
		".git/info/attributes"
	].map(function(thing) {
		if (fs.existsSync(thing))
			cleanConfigFile(thing);
	});

	done();
	callback();
}

function updateStatus(callback) {
	seq([
		makeAsync(checkMergeMarker),
		makeAsync(checkMprLock),
		initializeGitIgnore,
		updateBase,
		when(isMprModified, function(cb) { cb(); }, markMprAsNotModified),
		when(isMprConflicted, writeConflictData),
		function(callback) {
			debug("status updated.");
			callback();
		}
	], callback);
}

function createCacheDir() {
	debug("checking Mendix cache directory");
	/* cache dir is used internally by the modeler to store version control meta data */
	if (!fs.existsSync(MENDIX_CACHE)) {
		info("creating Mendix cache directory");
		fs.mkdirsSync(MENDIX_CACHE);
	}
}

function checkGitDir() {
	debug("checking git repository");
	if (!fs.existsSync(".git")) {
		console.info("[ERROR] Please run mxgit from a git directory");
		process.exit(7);
	}
}

function initializeGitIgnore(callback) {
	debug("updating .gitignore file");
	updateConfigFile(".gitignore", [
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
	]);
	callback();
}

function checkMprLock() {
	debug("checking mpr lock");
	/* a lock file exists as long as the mpr is opened in a modeler (or if the modeler didn't exit cleanly */
	if (fs.existsSync(mprName + ".lock")) {
		if (ignoreMprLock) {
			console.info("[WARN] The file '" + mprName + "' is currently being edited in the Mendix Business Modeler.");
			requiresModelerReload = true;
		}
		else {
			console.info("[ERROR] The file '" + mprName + "' is currently being edited in the Mendix Business Modeler. Please close the project (or remove the lock file)");
			process.exit(9);
		}
	}
}

function checkMergeMarker() {
	debug("checking merge marker");
	/* merge marker exists if as soon as the modeler has picked up a merge conflict, and created a new mpr from that. It disappears as soon as the model has no conflicts anymore, to indicate that the conflict has been resolved (which should be communicated to git by using a git add command) */
	if (fs.existsSync(MERGE_MARKER)) {
		console.info("[ERROR] The file '" + mprName + "' is currently being merged by the Mendix Business Modeler. Please resolve any model conflicts first.");
		process.exit(10);
	}
}

function checkSvnDir(callback) {
	debug("checking svn repository");
	/* svn dir shouldn't exists, or it should be our dummy repository */
	if (fs.existsSync(".svn/wc.db")) {
		execSvnQuery("select root from REPOSITORY", function(err, results) {
			assertNotError(err);
			if (results[0].trim() == BOGUS_REPO)
				callback();
			else {
				console.info("[ERROR] This repository is currently managed by SVN / Mendix Teamserver. Please remove the current .svn directory before managing the repo with (mx)git. Repo: " + results[0]);
				process.exit(8);
			}
		});
	}
	else
		callback();
}

function initializeSvnDir(callback) {
	if (!fs.existsSync(".svn")) {
		info("initializing SVN dummy repository...");
		/* the dummy repository is there to trick the modeler into thinking this project is properly versioned. We need to alter the actual db though to use the correct name of the mpr file, which might differ per project */
		fs.copySync(__dirname + "/dummysvn/.svn", process.cwd() + "/.svn");
		execSvnQuery(
			"update NODES set local_relpath = '" + mprName + "' where local_relpath = 'GitBasedTeamserverRepo.mpr'",
			function(err) {
				assertNotError(err);
				done();
				callback();
			}
		);
	}
	else
		callback();
}

function updateSprintrProjectId(projectid, callback) {
	info("updating project id to '" + projectid+ "'...");

	if (!/^[a-zA-Z0-9-_]+$/.test(projectid)) {
		console.info("[ERROR] '" + projectid + "' doesn't look like a valid project id");
		process.exit(11);
	}

	var needle = "mx:sprintr-project-id 14 dummyprojectid";
	var replacement = "mx:sprintr-project-id " + projectid.length + " " + projectid;
	//TODO: Note: this doesn't update the project id once it is set. Requires --reset first.
	execSvnQuery(
		"update NODES set properties = replace(properties, '" + needle + "', '" + replacement + "') where local_relpath = '' and kind = 'dir'",
		function(err) {
			assertNotError(err);
			done();
			callback();
		}
	);
}

function findMprFile() {
	var files = fs.readdirSync(process.cwd());
	for(var i = 0; i < files.length; i++)
		if (files[i].match(/\.mpr$/))
			return files[i];

	console.info("[ERROR] No .mpr file found in current working directory");
	process.exit(2);
}

function getMprMendixVersion(callback) {
	debug("determine Mendix version");
	execMprQuery("select _ProductVersion from _MetaData", function(err, lines) {
		assertNotError(err);
		callback(null, lines[0]);
	});
}

function updateBase(callback) {
	debug("updating base data");

	using([
			findLatestMprHash,
			getMprMendixVersion
		],
		function(err, latestHash, version) {
			assertNotError(err);
			debug("using Mendix version " + version);
			fs.writeFileSync(BASE_VER, version, FILE_OPTS);
			fs.writeFileSync(BASE_REV, "2", FILE_OPTS);

			if(latestHash !== null && fs.existsSync(BASE_REV_GIT) && latestHash == fs.readFileSync(BASE_REV_GIT, FILE_OPTS)) {
				debug("already up to date");
				callback();
			}
			else {
				requiresModelerReload = true;
				fs.writeFileSync(BASE_REV_GIT, latestHash, FILE_OPTS);

				if (fs.existsSync(BASE_DATA))
					fs.removeSync(BASE_DATA);

				if (latestHash === null) {
					fs.copySync(mprName, BASE_DATA);
					info("initialized new base version of " + mprName);
					copyBaseToPristine();
					callback();
				}
				else {
					info("wrote new base version of " + mprName);
					storeBlobToFile(latestHash, BASE_DATA, function(err) {
						assertNotError(err);
						copyBaseToPristine();
						callback();
					});
				}
			}
	});
}

function copyBaseToPristine() {
	//Override the cached file for the mpr. This makes sure that if somebody accidentally
	//executes an SVN revert, at least the proper base will be used.
	//Note that we cannot simply break the revert function, since the modeler somehow internally depends on it.
	debug("updating SVN cache..");
	fs.copySync(BASE_DATA, ".svn/pristine/19/190fc40c2d5f1f4ec60919d2db2be93a0053c48a.svn-base");
}

function findLatestMprHash(callback) {
	debug("searching base version of " + mprName);
	execGitCommand("ls-tree HEAD", function(err, treeFiles) {
		if (err) {
			console.info("[WARN] failed to find git HEAD:  "+ err);
			callback(null, null);
			return;
		}

		for(var i = 0; i < treeFiles.length; i++)
			if (treeFiles[i].indexOf(mprName) != -1) {
				callback(null, treeFiles[i].split(/\s+/)[2]);
				return;
			}

		callback(null, null);
	});
}

function isMprModified(callback) {
	debug("detecting modified status");
	getGitFileStatus(function(status) {
		callback(null, "M" == status);
	});
}

function isMprConflicted(callback) {
	debug("detecting conflict status");
	getGitFileStatus(function(status) {
		callback(null, "U" == status);
	});
}

function getGitFileStatus(callback) {
	debug("detecting file status");
	execGitCommand("status --porcelain " + mprName, function(err, lines) {
		assertNotError(err);
		if (lines.length) {
			var status =  lines[0].charAt(1);
			debug("file status is '" + status + "'");
			callback(status ? status : null);
		}
		else
			callback(null);
	});
}

function showMergeMessage() {
	console.info("");
	console.info(">>> MERGE CONFLICT DETECTED. PLEASE SOLVE THE CONFLICTS IN THE MODELER <<<");
	console.info(">>> TO MARK RESOLVED, USE 'git add " + mprName +"' <<<");
	console.info("");

}

function markMprAsConflicted(callback) {
	seq([
		markMprAsNotModified,
		partial(execSvnQuery, "insert into ACTUAL_NODE (wc_id, local_relpath, conflict_old, conflict_new) values (1,'"+ mprName +"','"+ mprName +".left','"+ mprName +".right')")
	], callback);
}

function markMprAsNotModified(callback) {
	execSvnQuery("delete from ACTUAL_NODE where local_relpath = '" + mprName + "'", callback);
}

function gitMergeDrive(fileArray) {
	// mxgit --merge as merge driver was introduced because git itself has no hook whenever a merge fails,
	// which is exactly the case we are interested in. So we introduce our own driver that
	// stores the conflict data in svn and after that marks the conflict as unresolved

	debug("processing mpr merge " + fileArray);
	if (fileArray.length != 3)
		throw "Expected exactly three arguments for a --merge command";

	fs.copySync(fileArray[0], mprName + ".left");
	fs.copySync(fileArray[2], mprName + ".right");

	markMprAsConflicted(function(err) {
		assertNotError(err);
		showMergeMessage();

		//https://www.kernel.org/pub/software/scm/git/docs/gitattributes.html#_defining_a_custom_merge_driver
		//Exit non-zero, mark the file as conflicted so that the modeler will merge it
		//(in fact, it would do the same if we would return zero, but this makes it more clear that
		//a conflict should be merged; use git add in the end to mark resolved)
		process.exit(1);
	});
}

function writeConflictData(callback) {
	info("merge conflict detected, writing merge information...");
	requiresModelerReload = true;

	/* A SVN conflict is stored as follows:
	conflict_old column in ACTUAL_NODE table: mpr.merge-left.r# (BASE), conflict_new column: mpr.merge-right.r# (THEIRS)
	modeler-merge-marker appears as soon as the file is merged by the modeler, but still has conflicts. Disappears as soon as last conflict is resolved in the modeler. */

	execGitCommand("ls-files -u " + mprName, function(err, mergestatus) {
		assertNotError(err);
		if (mergestatus.length < 3)
			callback("mxgit: cannot handle the current conflict, please use an external tool");
		else {
			var baseblob = mergestatus[0].split(/\s+/)[1];
			var theirsblob = mergestatus[2].split(/\s+/)[1];

			seq([
				partial(storeBlobToFile, baseblob, mprName + ".left"),
				partial(storeBlobToFile, theirsblob, mprName + ".right"),
				markMprAsConflicted
			], function(err) {
				assertNotError(err);
				done();

				showMergeMessage();
				callback();
			});
		}
	});
}

function storeBlobToFile(hash, filename, callback) {
	var out = fs.openSync(filename, 'w');
	var child = child_process.spawn("git", ["cat-file", "-p", hash], {
		stdio: ['pipe', out, 'pipe']
	});

	child.on('close', function() {
		debug("stored " + hash + " -> " + filename);
		callback();
	});
}

function updateConfigFile(filename, requiredItems) {
	var contents = "";
	if (fs.existsSync(filename))
		contents = fs.readFileSync(filename, FILE_OPTS);

	var missing = [];
	for(var i = 0; i < requiredItems.length; i++) {
		var re = new RegExp("(^|\n)(" + escapeRegExp(requiredItems[i]) + ")($|\r?\n)");
		if (!re.test(contents))
			missing.push(requiredItems[i]);
	}

	if (missing.length) {
		missing.unshift("\n#mxgit-marker-start");
		missing.push("#mxgit-marker-end\n");
		fs.appendFileSync(filename, missing.join("\n"), FILE_OPTS);
	}
}

function cleanConfigFile(filename) {
	if (fs.existsSync) {
		var data = fs.readFileSync(filename, FILE_OPTS);
		var newdata = data.replace(/(\n#mxgit-marker-start)([\s\S]*?)(#mxgit-marker-end\n)/g,"");
		if (newdata != data)
			fs.writeFileSync(filename, newdata, FILE_OPTS);
	}
}

function escapeRegExp(str) {
	//http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

/**
	Logging and startup
*/

function info(msg) {
	lastInfoMsg = msg;
	console.info("mxgit: " + msg);
}

function done() {
	console.info("mxgit: " + lastInfoMsg + " DONE");
}

function debug(msg) {
	if (verbose)
		console.info("\t* " + msg);
}

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
	query = query.replace(/[\\\"]/g, function(r) { return "\\" + r; });

	execCommand([sqlite, file, "\"" + query + "\""].join(" "), callback);
}

function execGitCommand(command, callback) {
	execCommand("git " + command, callback);
}

function execCommand(command, callback) {
	child_process.exec(command, function(error, stdout) {
		if (error) {
			callback(error);
		}
		else
			callback(null, stdout.split(/\r?\n/));
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


function seq(funcs /* [func(callback(err))] */, callback /*optional func(err)) */) {
	function next(nextItem) {
		if (!nextItem) {
			if (callback) {
				callback();
			}
		}
		else {
			nextItem(function(err) {
				if (err) {
					if (callback)
						callback(err);
					else
						throw err;
				}
				else
					next(funcs.shift());
			});
		}
	}

	next(funcs.shift());
}

function using(paramFuncs /* [func(callback(err,res))] */, callback /* func(err, res) */) {
	var params = [];
	var left = paramFuncs.length;
	var aborted = false;

	paramFuncs.map(function(func, idx) {
		func(function(err, res) {
			if (aborted)
				return;
			else if (err) {
				aborted = true;
				callback(err);
			}
			else {
				params[idx] = res;
				if (--left === 0)
					callback.apply(null, [null].concat(params));
			}
		});
	});
}

function when(condfunc, whenfunc /*or array*/, elsefunc /*optional, or array*/) {
	function wrapSequence(func) {
		if (Array.isArray(func)) {
			return partial(seq, func); //how convenient
		}
		else
			return func;
	}

	return function(callback) {
		condfunc(function(err, conditionResult) {
			if (err)
				callback(err);
			else if (conditionResult)
				wrapSequence(whenfunc)(callback);
			else {
				if (elsefunc)
					wrapSequence(elsefunc)(callback);
				else
					callback();
			}
		});
	};
}

function makeAsync(func) {
	return function(callback) {
		var res;
		try {
			res = func();
		}
		catch(e) {
			callback(e);
			return;
		}
		callback(null, res);
	};
}

function partial(func/*, args*/) {
	var cargs = arguments;
	var scope = this;

	return function() {
		var args = [];
		for(var i = 1; i < cargs.length; i++)
			args.push(cargs[i]);
		for(var j = 0; j < arguments.length; j++)
			args.push(arguments[j]);
		return func.apply(scope, args);
	};
}

function assertNotError(err) {
	if (err)
		console.trace(err);
}
