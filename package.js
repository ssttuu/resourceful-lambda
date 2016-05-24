'use strict';


const fs = require('fs');
const path = require('path');

const AWS = require('aws-sdk');
const archiver = require('archiver');
const fse = require('fs-extra');

let S3 = new AWS.S3({
    region: process.env.AWS_REGION
});
let APIGateway = new AWS.APIGateway({
    region: process.env.AWS_REGION
});
let Lambda = new AWS.Lambda({
    region: process.env.AWS_REGION
});

let zippedDirs = {};
let createZip = (srcDir, destPath) => {
    if (zippedDirs[srcDir]) {
        return new Promise(resolve => resolve(destPath));
    }

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
                zippedDirs[srcDir] = destPath;
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

let createOrGetBucket = (bucket) => {
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
    });
};

let getResources = (restApi) => {
    return APIGateway.getResources({
        restApiId: restApi.id
    }).promise()
};

let findResource = (resourcePath, resources) => {
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

let parseRouteTree = (fullPath, pathPart, routeTreeNode, restApi, resources, parentResource) => {
    console.info('parsing tree', routeTreeNode);

    let foundResource = findResource(fullPath, resources);

    let getOrCreateResourcePromise = new Promise(resolve => resolve(foundResource));
    if (!foundResource) {
        getOrCreateResourcePromise = getOrCreateResourcePromise.then(() => {
            console.warn('no resource');
            return APIGateway.createResource({
                parentId: parentResource.id,
                pathPart: pathPart,
                restApiId: restApi.id
            }).promise();
        });
    }
    console.info('creating resource: ', pathPart);
    return getOrCreateResourcePromise.then((resource) => {
        /*
         * Create Methods
         */
        let methodCreationPromise = new Promise(resolve => resolve());
        if (routeTreeNode['_methods']) {
            console.warn('_methods');
            let methods = Object.keys(routeTreeNode['_methods']);
            for (var i = 0; i < methods.length; i++) {
                let method = methods[i];
                methodCreationPromise = methodCreationPromise.then(() => {
                    console.info('creating method: ', method);
                    return APIGateway.getMethod({
                        restApiId: restApi.id,
                        resourceId: resource.id,
                        httpMethod: method
                    }).promise().then((resourceMethod) => {
                        console.warn('getResourceMethod', resourceMethod);
                        return new Promise(resolve => resolve(resourceMethod));
                    }, () => {
                        console.warn('error getting resource method, putting!');
                        return APIGateway.putMethod({
                            authorizationType: 'NONE',
                            httpMethod: method,
                            resourceId: resource.id,
                            restApiId: restApi.id
                        }).promise();
                    });
                }).then((resourceMethod) => {
                    console.log('here');
                    console.warn(methods, method);
                    let srcDir = routeTreeNode['_methods'][method];
                    console.log('here');
                    let zipFileName = process.env.GIT_HASH + '.zip';
                    let s3ZipFileName = method + '-' + process.env.GIT_HASH + '.zip';
                    console.log('here', process.env.DIST, srcDir, zipFileName);
                    let destFile = path.join(process.env.DIST, srcDir, zipFileName);
                    console.log('here');
                    let s3Key = path.join(srcDir, s3ZipFileName);

                    console.warn('creating zip');
                    return createZip(srcDir, destFile).then(() => {
                        /*
                         * Create Bucket
                         */
                        console.warn('created zip');
                        return createOrGetBucket(process.env.S3_BUCKET);
                    }).then(() => {
                        /*
                         * Create S3 Object
                         */
                        console.warn('created bucket');
                        console.warn('creating s3 object');
                        return S3.putObject({
                            Bucket: process.env.S3_BUCKET,
                            Key: s3Key,
                            Body: fs.readFileSync(destFile)
                        }).promise();
                    }).then((s3Object) => {
                        /*
                         * Create lambda function
                         */
                        console.warn('creating lambda function');
                        let srcResource = srcDir.replace('/', '-');
                        let functionName = `${srcResource}-${method}-${process.env.GIT_HASH}`;
                        return Lambda.getFunction({
                            FunctionName: functionName
                        }).promise().then((data) => {
                            console.warn('dataDATA', data);
                            return new Promise(resolve => resolve(data));
                        }, () => {
                            console.warn({
                                S3Bucket: process.env.S3_BUCKET,
                                S3Key: s3Key,
                                S3ObjectVersion: s3Object.VersionId
                            });
                            return Lambda.createFunction({
                                Code: {
                                    S3Bucket: process.env.S3_BUCKET,
                                    S3Key: s3Key,
                                    S3ObjectVersion: s3Object.VersionId
                                },
                                FunctionName: functionName,
                                Handler: 'index.handler',
                                // TODO: create & get role dynamically
                                Role: 'arn:aws:iam::647157453183:role/lambda_basic_execution',
                                Runtime: 'nodejs4.3',
                                Publish: true,
                                MemorySize: 128,
                                Timeout: 3
                            }).promise().then((data) => {
                                console.warn('createFunction data', data);
                                return new Promise(resolve => resolve(data));
                            }, (error) => {
                                console.warn('createFunction error', error);
                            });
                        });
                    });
                }).then((lambdaFunction) => {
                    /*
                     * Create Integration (lambda)
                     */
                    console.warn('creating integrations');
                    return APIGateway.getIntegration({
                        httpMethod: method,
                        resourceId: resource.id,
                        restApiId: restApi.id
                    }).promise().then((data) => {
                        console.warn('data', data);
                        return new Promise(resolve => resolve(data));
                    }, (error) => {
                        console.warn('error', error);
                        console.warn('lambdaFunction.FunctionArn', lambdaFunction.Configuration.FunctionArn);
                        return APIGateway.putIntegration({
                            httpMethod: method,
                            integrationHttpMethod: method,
                            resourceId: resource.id,
                            restApiId: restApi.id,
                            type: 'AWS',
                            uri: `arn:aws:apigateway:${process.env.AWS_REGION}:lambda:path/2015-03-31/functions/${lambdaFunction.Configuration.FunctionArn}/invocations`
                        }).promise().then((data) => {
                            console.warn('putIntegration data', data);
                            return new Promise(resolve => resolve(data));
                        }, (error) => {
                            console.warn('putIntegration error', error);
                        });
                    });

                }).then((resourceMethod) => {
                    /*
                     * Create Integration Response
                     */
                    console.warn('creating integration response');
                    return APIGateway.getIntegrationResponse({
                        httpMethod: method,
                        resourceId: resource.id,
                        restApiId: restApi.id,
                        statusCode: 200
                    }).promise().then((data) => {
                        return new Promise(resolve => resolve(data));
                    }, () => {
                        return APIGateway.putIntegrationResponse({
                            httpMethod: method,
                            resourceId: resource.id,
                            restApiId: restApi.id,
                            statusCode: 200
                        });
                    });
                }).then((resourceMethod) => {
                    /*
                     * Create Method Response
                     */
                    // TODO: APIGateway.createModel
                    console.warn('creating method response');
                    return APIGateway.getMethodResponse({
                        httpMethod: method,
                        resourceId: resource.id,
                        restApiId: restApi.id,
                        statusCode: 200
                    }).promise().then((data) => {
                        return new Promise(resolve => resolve(data));
                    }, () => {
                        return APIGateway.putMethodResponse({
                            httpMethod: method,
                            resourceId: resource.id,
                            restApiId: restApi.id,
                            statusCode: 200
                        });
                    });
                });
            }
        }

        return methodCreationPromise.then(() => {
            /*
             * Traverse the rest of the tree
             */
            console.warn('Traverse!');
            console.warn('creating sub resources');

            let subResources = Object.keys(routeTreeNode);
            let createSubResourcePromise = new Promise(resolve => resolve());
            for (var i = 0; i < subResources.length; i++) {
                let subResourcePathPart = subResources[i];
                if (subResourcePathPart === '_methods') {
                    continue;
                }

                createSubResourcePromise = createSubResourcePromise.then(() => {
                    return parseRouteTree(
                        path.join(fullPath, subResourcePathPart),
                        subResourcePathPart,
                        routeTreeNode[subResourcePathPart],
                        restApi,
                        resources,
                        resource
                    );
                });
            }

            return createSubResourcePromise;
            // return new Promise(resolve => resolve());
        });
    });


    // let items = Object.keys(routeTreeNode);
    // for (var i = 0; i < keys.length; i++) {
    //     let item = items[i];
    //     if ('_methods')
    //         if (findResource(item, resources)) {
    //
    //         }
    // }
    // console.info(route);
};

let main = (done) => {
    const routes = require('./routes');

    return createRestApi().then((restApi) => {
        console.info('rest api created');
        return getResources(restApi).then((resources) => {
            console.info('retrieved resources');
            return parseRouteTree('/', '/', routes['/'], restApi, resources);
        });
    }).then(() => {
        done();
    });


    // return createZip(srcDir, destFile);
};

module.exports = main;
