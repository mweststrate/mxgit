var fs = require('fs-extra'); 
var child_process = require('child_process');

var MENDIX_CACHE = '.mendix-cache/';
var BASE_DATA = MENDIX_CACHE + 'base_data';
var BOGUS_REPO = "https://thisRepoIsManagedByGitDoNotUseSVN.please";

var mprName = findMprFile();

function main() {
	if (!fs.existsSync(".git")) {
		console.error("Please run mxgit from a git directory");
		process.exit(1);
	}

	if (fs.existsSync(".svn") && getSVNRepUrl() != BOGUS_REPO) {
		console.error("This repository is currently managed by SVN / Mendix Teamserver. Please remove the current .svn directory before managing the repo with (mx)git");
		process.exit(5);

	}

	console.log("mxgit: using mpr " + mprName);

	//create cache dir if it doesn't exist
	if (!fs.existsSync(MENDIX_CACHE))
		fs.mkdir(MENDIX_CACHE);

	//TODO: kill svn dir and replace if it does exist

	//TODO update REPOSITORY$root table

	//TODO: setup gitignore if it doesn't exist

	//TODO: setup sprintr id if it doensn't exist, store in NODES or ACTUAL_NODE table...

	updateBase();
}

function findMprFile() {
	var files = fs.readdirSync(process.cwd());
	for(var i = 0; i < files.length; i++)
		if (files[i].match(/\.mpr$/))
			return files[i];

	console.error("No .mpr file found in current working directory");
	process.exit(2);
}

function updateBase() {
	findLatestMprHash(function(latestHash) {
		console.log("mxgit: setting base to " + latestHash);
		if (fs.existsSync(BASE_DATA))
			fs.removeSync(BASE_DATA);
		console.log("removed")
		if (latestHash == null) {
			fs.copy(mprName, BASE_DATA, afterCopyBase);
			console.log("copied");
		}
		else
			storeBlobToFile(latestHash, BASE_DATA, afterCopyBase);
	});
}

function afterCopyBase(err) {
	if (err) {
		console.error("Error while updating base file");
		console.error(err);
		process.exit(3);
	}

	//fix wc.db database; update NODES table, set local_relpath to mprname where local_relpath = GitBasedTeamserverRepo.mpr
	//TODO: check if base file has changed, if so, warn
		//store rev file (2) if not available in base_rev
	//extract and store version of baseblob file in base_ver

	//detect tree conflict?
	//find marker?

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


function commit(message) {
	var mprName = findMprName();
	
	//check marker for three conflict?

	//git add
	//git commit
	up();


}

function execGitCommand(command, callback) {
	child_process.exec("git " + command, function(error, stdout, stderr){
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
		console.log("process done");
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
