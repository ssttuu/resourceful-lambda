'use strict';

const fs = require('fs');
const path = require('path');

const AWS = require('aws-sdk');
const archiver = require('archiver');
const fse = require('fs-extra');


let S3 = new AWS.S3();
let APIGateway = new AWS.APIGateway({
    region: procescreateBuckets.env.AWS_REGION
});

let createBucket = (bucket) => {
    let bucketExists = S3.headBucket({Bucket: bucket}).promise();
    return bucketExists.then((data) => {
        return new Promise(resolve => resolve(data))
    }, () => {
        return S3.createBucket({Bucket: bucket, ACL: 'private'}).promise().then(() => {
            return S3.waitFor('bucketExists', {Bucket: bucket}).promise();
        })
    })
};

let createRestApi = () => {
    // check to see if it exists
    return APIGateway.getRestApis().promise().then((data) => {
        let apiItem = null;
        for (var i = 0; i < data.items.length; i++) {
            let item = data.items[i];
            if (item.name === process.env.GIT_HASH) {
                apiItem = item;
                break;
            }
        }

        console.info('apiItem', apiItem);
        if (apiItem) {
            return new Promise(resolve => resolve(apiItem));
        } else {
            console.info('creating rest api');
            return APIGateway.createRestApi({
                name: process.env.GIT_HASH
            }).promise();
        }
    }, (error) => {
        console.info('error', error);
    }).then((restApi) => {
        // get root resource id - /
        return APIGateway.getResources({
            restApiId: restApi.id
        }).promise().then((resources) => {

            let findResource = (resourcePath) => {
                let _resource = null;
                for (var i = 0; i < resources.items.length; i++) {
                    let item = resources.items[i];
                    if (item.path === resourcePath) {
                        _resource = item;
                        break;
                    }
                }
                return _resource;
            };

            let rootResource = findResource('/');
            let usersResource = findResource('/users');

            let createResourcePromise = new Promise(resolve => resolve());
            if (!usersResource) {
                createResourcePromise = createResourcePromise.then(() => {
                    return APIGateway.createResource({
                        parentId: rootResource.id,
                        pathPart: 'users',
                        restApiId: restApi.id
                    }).promise();
                });
            }

            

            return createResourcePromise;
        });
    })
};

let createZip = (srcDir, destPath) => {
    return new Promise(resolve => {
        fs.access(destPath, fs.F_OK, function (err) {
            if (!err) {
                resolve();
            } else {
                fse.mkdirsSync(path.dirname(destPath));
                resolve();
            }
        });
    }).then(() => {
        return new Promise(resolve => {
            var output = fs.createWriteStream(destPath);
            var archive = archiver('zip');

            output.on('close', function () {
                console.log(archive.pointer() + ' total bytes');
                console.log('archiver has been finalized and the output file descriptor has closed.');
                resolve(destPath);
            });

            archive.on('error', function (err) {
                throw err;
            });

            archive.pipe(output);
            archive.bulk([
                {expand: true, cwd: srcDir, src: ['**'], dest: ''}
            ]);
            archive.finalize();
        });
    });
};

let deploy = (done) => {
    let destFile = path.join(process.env.DIST, process.env.SRC_DIR, `${process.env.GIT_HASH}.zip`);

    return (process.env.S3_BUCKET).then(() => {
        console.info('Bucket exists or was created');
        return new Promise(resolve => resolve());
        // return createZip(srcDir, destFile);
    }).then(() => {
        console.info('Zip created');
        return new Promise(resolve => resolve());
        // return S3.putObject({
        //     Bucket: bucket,
        //     Key: path.join(srcDir, `${gitHash}.zip`),
        //     Body: fs.readFileSync(destFile)
        // }).promise();
    }).then(() => {
        console.info('Zip Uploaded');
        return createRestApi();
    }).then(() => {
        console.info('done!');
        done();
    });
};

module.exports = deploy;




