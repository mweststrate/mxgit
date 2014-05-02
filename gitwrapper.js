ensureMendixCacheDir(); //.mendix-cache
downloadDummySvnRepo();
//todo: switch to non-real projectid & ts dir



function ensureMendixCacheDir(){

}

function up() {
	var mprName = findMprName();
	var baseblob = findBaseBlob(mprName);

	//copy baseblob to cache/base_data
	//store rev file (2) if not available
	//extract and store version of baseblob file

	//detect tree conflict?
	//find marker?
}

function commit(message) {
	var mprName = findMprName();
	
	//check marker for three conflict?

	//git add
	//git commit
	up();


}

require('child_process').exec(command, function(error, stdout, stderr){ callback(stdout); });