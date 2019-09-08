/*
 * Renew an API key by using a predefined API key value.
 *
 * Prerequisites:
 * - Have a valid API key
 * - Have a registered user that will act as the operator of the change
 *
 * Mandatory command line arguments:
 * - oldApiKey: the API key to renew
 * - newApiKey: the new API key value to apply for renew
 * - operator: the user that will be identified as the owner of changes
 *
 * Can be executed as the following: mongo [OPTIONS] --eval "var oldApiKey='foo', newApiKey='bar', operator='me';" renew-api-key_1.20.x.js
 *
 * /!\ Tested with Gravitee v1.20.x /!\
 * /!\ Dump your Mongo database before any operation! /!\
 *
 * @author Aurelien Bourdon
 */

/**
 * The ApiKeyRenewer is where operation will be done. It owns a set of context variables necessary for apply changes
 *
 * @param oldApiKey the API Key to renew
 * @param newApiKey the API Key value to use for renew
 * @param operator the user that will be identified as the operator
 * @constructor
 */
function ApiKeyRenewer(oldApiKey, newApiKey, operator) {
    this.oldApiKey = oldApiKey;
    this.newApiKey = newApiKey;
    this.operator = operator;
    this.insertNewApiKeyAuditId = undefined;
    this.revokeOldApiKeyAuditId = undefined;

    this.init();
}

/**
 * Initializes an ApiKeyRenewer
 */
ApiKeyRenewer.prototype.init = function () {
    // Retrieve the operator identifier
    const knownOperator = db.users.findOne({'sourceId': this.operator});
    if (!knownOperator) {
        error('User "' + this.operator + '" cannot be found');
    }
    this.operatorId = knownOperator._id;

    // Check if new API key already exists
    if (db.keys.findOne({'_id': this.newApiKey})) {
        error('API key "' + this.newApiKey + '" already exists and cannot be used as a new API key');
    }

    // Retrieve the API key according to the this.oldApiKey value
    var apiKey = db.keys.findOne({'_id': this.oldApiKey});
    if (!apiKey) {
        error('API Key "' + this.oldApiKey + '" cannot be found');
    }
    if (apiKey.revoked) {
        error('API Key "' + this.oldApiKey + '" is already revoked');
    }

    // Retrieve the subscription associated to API key
    this.subscription = db.subscriptions.findOne({'_id': apiKey.subscription});
    if (!this.subscription) {
        error('Subscription cannot be found for API Key "' + this.oldApiKey + '"');
    }

    // Set the now date
    this.now = ISODate();
};

/**
 * Insert the new API key according to ApiKeyRenewer context.
 *
 * Inserting the new API key causes:
 * - adding the API key into the keys collection
 * - adding an audit of the key creation in the audits collection. Audit event is a APIKEY_RENWED
 */
ApiKeyRenewer.prototype.insertNewApiKey = function () {
    // Insert the new API key
    info("Inserting new API key...");
    try {
        var status = db.keys.insertOne({
            "_id": this.newApiKey,
            "subscription": this.subscription._id,
            "application": this.subscription.application,
            "plan": this.subscription.plan,
            "createdAt": this.now,
            "updatedAt": this.now,
            "revoked": false,
            "_class": "io.gravitee.repository.mongodb.management.internal.model.ApiKeyMongo"
        });
        if (status.insertedId !== this.newApiKey) {
            throw 'Unable to insert new API key. Apply rollback and exit...';
        }
    } catch (e) {
        error(e, false);
        this.rollback();
    }

    // Insert audit associated to API key creation
    info("Inserting audit associated to API key creation...");
    this.insertNewApiKeyAuditId = ObjectId().valueOf();
    try {
        status = db.audits.insertOne({
            "_id": this.insertNewApiKeyAuditId,
            "referenceId": this.subscription.api,
            "referenceType": "API",
            "user": this.operatorId,
            "event": "APIKEY_RENEWED",
            "properties": {"API_KEY": this.newApiKey},
            "patch": "[{\"op\":\"add\",\"path\":\"/application\",\"value\":\"" + this.subscription.application + "\"},{\"op\":\"add\",\"path\":\"/key\",\"value\":\"" + this.newApiKey + "\"},{\"op\":\"add\",\"path\":\"/plan\",\"value\":\"" + this.subscription.plan + "\"},{\"op\":\"add\",\"path\":\"/revoked\",\"value\":false},{\"op\":\"add\",\"path\":\"/subscription\",\"value\":\"" + this.subscription._id + "\"}]",
            "createdAt": this.now,
            "_class": "io.gravitee.repository.mongodb.management.internal.model.AuditMongo"
        });
        if (status.insertedId !== this.insertNewApiKeyAuditId) {
            throw 'Unable to insert audit associated to API key creation. Apply rollback and exit...';
        }
    } catch (e) {
        error(e, false);
        this.rollback();
    }
};

/**
 * Revoke the old API key according to ApiKeyRenewer context
 */
ApiKeyRenewer.prototype.revokeOldApiKey = function () {
    // Revoke old API key
    info("Revocating old API key...");
    try {
        var status = db.keys.updateOne({
            '_id': this.oldApiKey
        }, {
            '$set': {
                'revoked': true,
                'revokedAt': this.now
            }
        });
        if (!status.acknowledged || status.modifiedCount !== 1) {
            throw 'Unable to update old API key to revoke it. Apply rollback and exit...';
        }
    } catch (e) {
        error(e, false);
        this.rollback();
    }

    // Insert audit associated to API key revocation
    info("Inserting audit associated to API key revocation...");
    this.revokeOldApiKeyAuditId = ObjectId().valueOf();
    try {
        status = db.audits.insertOne({
            "_id": this.revokeOldApiKeyAuditId,
            "referenceId": this.subscription.api,
            "referenceType": "API",
            "user": this.operatorId,
            "event": "APIKEY_REVOKED",
            "properties": {"API_KEY": this.oldApiKey},
            "patch": "[{\"op\":\"add\",\"path\":\"/revokedAt\",\"value\":" + this.now.getTime() + "},{\"op\":\"replace\",\"path\":\"/revoked\",\"value\":true}]",
            "createdAt": this.now,
            "_class": "io.gravitee.repository.mongodb.management.internal.model.AuditMongo"
        });
        if (status.insertedId !== this.revokeOldApiKeyAuditId) {
            throw 'Unable to insert audit associated to API key revocation. Apply rollback and exit...';
        }
    } catch (e) {
        error(e, false);
        this.rollback();
    }
};

/**
 * Rollback changes according to ApiKeyRenewer context
 */
ApiKeyRenewer.prototype.rollback = function () {
    try {
        db.keys.remove({'_id': this.newApiKey});
        if (this.insertNewApiKeyAuditId) {
            db.audits.remove({'_id': this.insertNewApiKeyAuditId});
        }
        db.keys.updateOne({
            '_id': this.oldApiKey
        }, {
            '$set': {
                'revoked': false
            },
            '$unset': {
                'revokedAt': ''
            }
        });
        if (this.revokeOldApiKeyAuditId) {
            db.audits.remove({'_id': this.revokeOldApiKeyAuditId});
        }
    } catch (e) {
        error("Rollback cannot be fully applied: " + e)
    }
    error("Rollback done. Exiting...");
};

/**
 * Main entry point
 */
ApiKeyRenewer.prototype.run = function () {
    this.insertNewApiKey();
    this.revokeOldApiKey();
    info('Success: API key "' + this.oldApiKey + '" renewed by "' + this.newApiKey + '"');
};


/**
 * Log a message accodring to the given level
 *
 * @param level the log criticity level
 * @param message the message to log
 */
function log(level, message) {
    print(new Date().toString() + ' [' + level + '] ' + message);
}

/**
 * Log an error message and optionally quit with error (status 1)
 *
 * @param message the error message to log
 * @param quitOnError quit with status 1 error (default true)
 */
function error(message, quitOnError = true) {
    log('ERROR', message);
    if (quitOnError) {
        quit(1);
    }
}

/**
 * Log an informational message
 *
 * @param message the information message to log
 */
function info(message) {
    log('INFO', message);
}

/**
 * Check if program arguments are well defined. If not, log error message and quit with error
 *
 * By default, programme arguments are the following:
 * - operator
 * - oldApiKey
 * - newApiKey
 */
function checkMainArguments() {
    if (!this.operator) {
        error('"operator" parameter is missing');
    }

    if (!this.oldApiKey) {
        error('"oldApiKey" parameter is missing');
    }

    if (!this.newApiKey) {
        error('"newApiKey" parameter is missing');
    }
}

/**
 * The main entry point
 */
function main() {
    checkMainArguments();
    var apiKeyRenewer = new ApiKeyRenewer(this.oldApiKey, this.newApiKey, this.operator);
    apiKeyRenewer.run();
}

// Entry point execution
main();
