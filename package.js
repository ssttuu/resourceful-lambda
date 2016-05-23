'use strict';


const fs = require('fs');
const path = require('path');

const AWS = require('aws-sdk');
const archiver = require('archiver');
const fse = require('fs-extra');

let S3 = new AWS.S3();
let APIGateway = new AWS.APIGateway({
    region: process.env.AWS_REGION
});

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

let parseRouteTree = (parentResource, pathPart, routeTreeNode, restApi, resources) => {
    console.info('parsing tree', routeTreeNode);

    let foundResource = findResource(item, resources);

    let getOrCreateResourcePromise = new Promise(resolve => resolve(foundResource));
    if (!foundResource) {
        getOrCreateResourcePromise = getOrCreateResourcePromise.then(() => {
            return APIGateway.createResource({
                parentId: parentResource.id,
                pathPart: pathPart,
                restApiId: restApi.id
            }).promise();
        });
    }

    return getOrCreateResourcePromise.then((resource) => {
        /*
         * Create Methods
         */
        if (routeTreeNode['_methods']) {
            let methods = Object.keys(routeTreeNode['_methods']);
            for (var i = 0; i < methods.length; i++) {
                APIGateway.putMethod({
                    
                })
            }
        }
    });


    let items = Object.keys(routeTreeNode);
    for (var i = 0; i < keys.length; i++) {
        let item = items[i];
        if ('_methods')
            if (findResource(item, resources)) {

            }
    }
    console.info(route);
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
