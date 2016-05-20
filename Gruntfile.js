'use strict';

const grunt = require('grunt');

grunt.loadNpmTasks('grunt-env');

grunt.initConfig({
    env: {
        test: {
            AWS_PROFILE: 'lambda'
        },
        deploy: {
            AWS_PROFILE: 'lambda',
            S3_REGION: 'us-east-1',
            S3_BUCKET: 'resourceful-lambda',
            SRC_DIR: 'resources/users',
            DIST: 'dist'
        }
    },
    lambda_package: {
        default: {}
    },
    lambda_deploy: {
        default: {
            function: 'Users'
        }
    }
});

grunt.registerTask('lambda_test', 'Test Lambda Function', function() {
    console.warn("testing");
});

grunt.registerTask('lambda_package', 'Test Lambda Function', function() {
    console.warn("packaging");
});

grunt.registerTask('lambda_deploy', 'Test Lambda Function', function() {
    let done = this.async();

    let deploy = require('./deploy.js');
    return deploy(done);
});

grunt.registerTask('test', ['env:test', 'lambda_test']);
grunt.registerTask('deploy', ['env:deploy', 'lambda_package', 'lambda_deploy']);



