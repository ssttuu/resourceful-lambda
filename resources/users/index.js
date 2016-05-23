'use strict';

exports.handler = (event, context) => {
    let datetime = new Date();
    context.done(null, {'datetime': datetime.toISOString()});
};
