/*
 * Renew an API key by using a predefined API key value.
 *
 * Prerequisites:
 * - Have a valid API key
 * - Have a registered username
 *
 * Mandatory command line arguments:
 * - oldApiKey: the API key to renew
 * - newApiKey: the new API key value to apply for renew
 * - username: the username that will be identified as the owner of changes
 *
 * Can be executed as the following: mongo [OPTIONS] --eval "var oldApiKey='foo', newApiKey='bar', username='me';" renew-api-key.js
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
 * @param username the username that will be identified as the operator
 * @constructor
 */
function ApiKeyRenewer(oldApiKey, newApiKey, username) {
    this.oldApiKey = oldApiKey;
    this.newApiKey = newApiKey;
    this.username = username;
    this.insertNewApiKeyAuditId = undefined;
    this.revokeOldApiKeyAuditId = undefined;

    this.init();
}

/**
 * Initializes an ApiKeyRenewer
 */
ApiKeyRenewer.prototype.init = function () {
    // Set the user
    this.user = db.users.findOne({'username': this.username});
    if (!this.user) {
        error('User "' + this.username + '" cannot be found');
    }
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
    var status = db.keys.insert({
        "_id": this.newApiKey,
        "subscription": this.subscription._id,
        "application": this.subscription.application,
        "plan": this.subscription.plan,
        "createdAt": this.now,
        "updatedAt": this.now,
        "revoked": false,
        "_class": "io.gravitee.repository.mongodb.management.internal.model.ApiKeyMongo"
    });
    if (status.nInserted !== 1) {
        error("Unable to insert new API key. Apply rollback and exit...", false);
        rollback();
    }

    // Insert audit associated to API key creation
    info("Inserting audit associated to API key creation...");
    this.insertNewApiKeyAuditId = ObjectId();
    status = db.audits.insert({
        "_id": this.insertNewApiKeyAuditId,
        "referenceId": this.subscription.api,
        "referenceType": "API",
        "user": this.user._id,
        "event": "APIKEY_RENEWED",
        "properties": {"API_KEY": this.newApiKey},
        "patch": "[{\"op\":\"add\",\"path\":\"/application\",\"value\":\"" + this.subscription.application + "\"},{\"op\":\"add\",\"path\":\"/key\",\"value\":\"" + this.newApiKey + "\"},{\"op\":\"add\",\"path\":\"/plan\",\"value\":\"" + this.subscription.plan + "\"},{\"op\":\"add\",\"path\":\"/revoked\",\"value\":false},{\"op\":\"add\",\"path\":\"/subscription\",\"value\":\"" + this.subscription._id + "\"}]",
        "createdAt": this.now,
        "_class": "io.gravitee.repository.mongodb.management.internal.model.AuditMongo"
    });
    if (status.nInserted !== 1) {
        error("Unable to insert audit associated to API key creation. Apply rollback and exit...", false);
        this.rollback();
    }
};

/**
 * Revoke the old API key according to ApiKeyRenewer context
 */
ApiKeyRenewer.prototype.revokeOldApiKey = function () {
    // Revoke old API key
    info("Revocating old API key...");
    var status = db.keys.updateOne({
        '_id': this.oldApiKey
    }, {
        '$set': {
            'revoked': true,
            'revokedAt': this.now
        }
    });
    if (!status.acknowledged || status.modifiedCount !== 1) {
        error("Unable to update old API key to revoke it. Apply rollback and exit...", false);
        this.rollback();
    }

    // Insert audit associated to API key revocation
    info("Inserting audit associated to API key revocation...");
    this.revokeOldApiKeyAuditId = ObjectId();
    status = db.audits.insert({
        "_id": this.revokeOldApiKeyAuditId,
        "referenceId": this.subscription.api,
        "referenceType": "API",
        "user": this.user._id,
        "event": "APIKEY_REVOKED",
        "properties": {"API_KEY": this.oldApiKey},
        "patch": "[{\"op\":\"add\",\"path\":\"/revokedAt\",\"value\":" + this.now + "},{\"op\":\"replace\",\"path\":\"/revoked\",\"value\":true}]",
        "createdAt": this.now,
        "_class": "io.gravitee.repository.mongodb.management.internal.model.AuditMongo"
    });
    if (status.nInserted !== 1) {
        error("Unable to insert audit associated to API key revocation. Apply rollback and exit...", false);
        this.rollback();
    }
};

/**
 * Rollback changes according to ApiKeyRenewer context
 */
ApiKeyRenewer.prototype.rollback = function () {
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
 * - username
 * - oldApiKey
 * - newApiKey
 */
function checkMainArguments() {
    if (!this.username) {
        error('"username" parameter is missing');
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
    var apiKeyRenewer = new ApiKeyRenewer(this.oldApiKey, this.newApiKey, this.username);
    apiKeyRenewer.run();
}

// Entry point execution
main();
