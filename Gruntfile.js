'use strict';


const childProcess = require('child_process');
const grunt = require('grunt');

grunt.loadNpmTasks('grunt-env');

const GIT_HASH = childProcess.execSync('git rev-parse HEAD').toString().trim();

grunt.initConfig({
    env: {
        test: {
            AWS_PROFILE: 'lambda',
            GIT_HASH: GIT_HASH
        },
        deploy: {
            AWS_PROFILE: 'lambda',
            AWS_REGION: 'us-east-1',
            S3_BUCKET: 'resourceful-lambda',
            SRC_DIR: 'resources/users',
            DIST: 'dist',
            GIT_HASH: GIT_HASH
        }
    }
});

grunt.registerTask('lambda_test', 'Test Lambda Function', function() {
    console.warn("testing");
});

grunt.registerTask('lambda_package', 'Test Lambda Function', function() {
    console.warn("packaging");
    let done = this.async();

    let _package = require('./package.js');
    return _package(done);
});

grunt.registerTask('lambda_deploy', 'Test Lambda Function', function() {
    let done = this.async();

    let deploy = require('./deploy.js');
    return deploy(done);
});

grunt.registerTask('test', ['env:test', 'lambda_test']);
grunt.registerTask('package', ['env:deploy', 'lambda_package']);
grunt.registerTask('deploy', ['env:deploy', 'lambda_package', 'lambda_deploy']);



