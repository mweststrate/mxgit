var fs = require('fs.extra'); //TODO: add node dependency fs.extra
var execSync = require("exec-sync"); //TODO: add node dependency
var process = require('process');
var child_process = require('child_process');

var mprName = findMprFile();
var MENDIX_CACHE = '.mendix-cache/';

function main() {
	if (!fs.existsSync(".git")) {
		console.error("Please run mxgit from a git directory");
		process.exit(1);
	}

	console.log("mxgit using mpr " + mprName);

	//create cache dir if it doesn't exist
	if (!fs.existsSync(MENDIX_CACHE))
		fs.mkdir(MENDIX_CACHE);

	//TODO: kill svn dir and replace if it does exist

	//TODO: setup gitignore if it doesn't exist

	//TODO: setup sprintr id if it doensn't exist

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
	var latestHash = findLatestMprHash();
	if (latestHash == null) {
		fs.copy(mprName, MENDIX_CACHE + 'base_data', afterCopyBase);
	else
		storeBlobToFile(latestHash, MENDIX_CACHE + 'base_data', afterCopyBase);
}

function afterCopyBase(err) {
	if (err) {
		console.error("Error while updating base file");
		console.error(err);
		process.exit(3);
	}
	//TODO: check if base file has changed, if so, warn
		//store rev file (2) if not available in base_rev
	//extract and store version of baseblob file in base_ver

	//detect tree conflict?
	//find marker?

}

function findLatestMprHash() {
	var treeFiles = execGitCommand("ls-tree HEAD");
	for(var i = 0; i < treeFiles.length; i++)
		if (treeFiles[i].indexOf(mprName) != -1)
			return treeFiles[i].split(/\s/)[2];

	return null;
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

function execGitCommand(command) {
	return execSync("git " + command).split(/\r?\n/);
}

function storeBlobToFile(hash, filename, callback) {
	out = fs.openSync(filename, 'w');
	var child = child_process.spawn("git", ["cat-file", "-p", hash], {
		stdio: [ 'pipe', out, 'pipe']
	});
	out.close();

	callback(); //todo: not async yet so not needed?
};

if ((typeof (module) !== "undefined" && !module.parent))
	main();
