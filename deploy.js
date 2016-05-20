'use strict';

const fs = require('fs');
const path = require('path');

const AWS = require('aws-sdk');
const archiver = require('archiver');


let s3 = new AWS.S3();

let createBucket = (bucket) => {
    let bucketExists = s3.headBucket({Bucket: bucket}).promise();
    return bucketExists.then((data) => {
        return new Promise(resolve => resolve(data))
    }, () => {
        return s3.createBucket({Bucket: bucket, ACL: 'private'}).promise().then(() => {
            return s3.waitFor('bucketExists', {Bucket: bucket}).promise();
        })
    })
};

let createZip = (srcDir, destPath) => {
    return new Promise(resolve => {
        fs.access(srcDir, fs.F_OK, function (err) {
            if (!err) {
                resolve();
            } else {
                fs.mkdirSync(path.dirname(destPath));
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
    let bucket = process.env.S3_BUCKET;
    let srcDir = process.env.SRC_DIR;
    let destDir = process.env.DIST;

    let dateStr = new Date().toISOString();
    let destFile = path.join(destDir, `${dateStr}.zip`);

    return createBucket(bucket).then(() => {
        return createZip(srcDir, destFile);
    }).then(() => {

        // TODO: Push to S3 and notify lambda

        console.warn('done!');
        done();
    });
};

module.exports = deploy;




