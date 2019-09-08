/*
 * Extract user traces for GDPR usage.
 *
 * Command line arguments:
 * - sourceId: the source ID (required if email is not specified)
 * - email: the user email (required if sourceId is not specified)
 *
 * Can be executed as the following: mongo [OPTIONS] --eval "var sourceId='admin';" extract-user-traces_1.25.x.js
 *
 * /!\ Tested with Gravitee v1.25.x /!\
 * /!\ Dump your Mongo database before any operation! /!\
 *
 * @author Alexandre Carbenay
 */

/**
 * The UserTracesExtractor is where operation will be done.
 *
 * @param sourceId the source ID
 * @param email the user email
 * @constructor
 */
function UserTracesExtractor(sourceId, email) {
    this.sourceId = sourceId;
    this.email = email;
    this.userId = undefined;
    this.traces = {};

    this.init();
}

/**
 * Initializes an UserTracesExtractor
 */
UserTracesExtractor.prototype.init = function () {
    this.user = this.findUser();
    this.userId = this.user._id;
};

/**
 * Finds the user corresponding to either sourceId or email as specified in program parameters.
 */
UserTracesExtractor.prototype.findUser = function () {
    var user;
    if (this.sourceId) {
        user = db.users.findOne({'sourceId': this.sourceId});
    } else {
        user = db.users.findOne({'email': this.email});
    }

    if (!user) {
        error('User cannot be found (sourceId: "' + this.sourceId + '", email: "' + this.email + '")');
    }
    return user;
}

/**
 * Gets the name of the API corresponding to the specified ID, or the default name if the API has been deleted.
 *
 * @param apiId the API ID.
 * @param defaultName the default name to return if API has been deleted.
 */
UserTracesExtractor.prototype.getApiName = function (apiId, defaultName) {
    return this.getOrDefault(
            function() { return db.apis.findOne({"_id":apiId}) },
            function(api) { return api.name },
            defaultName);
}

/**
 * Gets the name of the application corresponding to the specified ID, or the default name if the application has been deleted.
 *
 * @param applicationId the application ID.
 * @param defaultName the default name to return if application has been deleted.
 */
UserTracesExtractor.prototype.getApplicationName = function (applicationId, defaultName) {
    return this.getOrDefault(
            function() { return db.applications.findOne({"_id":applicationId}) },
            function(application) { return application.name },
            defaultName);
}

/**
 * Gets the name of the plan corresponding to the specified ID, or the default name if the plan has been deleted.
 *
 * @param planId the plan ID.
 * @param defaultName the default name to return if plan has been deleted.
 */
UserTracesExtractor.prototype.getPlanName = function (planId, defaultName) {
    return this.getOrDefault(
        function() { return db.plans.findOne({"_id":planId}) },
        function(plan) { return plan.name },
        defaultName);
}

/**
 * Gets the value extracted from an element found by a function, or a default value if no value could be extracted.
 *
 * @param findElement a function to find an element.
 * @param extractValue a function to extract value from an element.
 * @param defaultValue the default value if no element was found.
 */
UserTracesExtractor.prototype.getOrDefault = function (findElement, extractValue, defaultValue) {
    var value = defaultValue;
    var element = findElement();
    if (element) {
        value = extractValue(element);
    }
    return value;
}

/**
 * Extracts audits logs.
 */
UserTracesExtractor.prototype.extractAudits = function () {
    return db.audits.find({"properties.USER" : this.userId}).sort({createdAt: 1})
        .map(item => Object.assign({
            id: item._id,
            date: item.createdAt,
            event: item.event,
            properties: item.properties,
            patch: deepParseJSON(item.patch)
        }));
}

/**
 * Extracts events logs.
 */
UserTracesExtractor.prototype.extractEvents = function () {
    return db.events.find({"properties.user" : this.userId}).sort({createdAt: 1})
        .map(item => Object.assign({
            id: item._id,
            date: item.createdAt,
            type: item.type,
            properties: Object.assign({}, item.properties),
            payload: deepParseJSON(item.payload)
        }))
        .map(event => {
            if (event.properties.api_id) {
                var api = db.apis.findOne({"_id" : event.properties.api_id});
                event.properties.api_name = api.name;
            }
            return event;
        });
}

/**
 * Extracts memberships.
 */
UserTracesExtractor.prototype.extractMemberships = function () {
    return db.memberships.find({"_id.userId" : this.userId}).sort({createdAt: 1})
        .map(item => Object.assign({
            id: item._id,
            date: item.createdAt,
            roles: item.roles
        }))
        .map(membership => {
            if (membership.id.referenceType == "APPLICATION") {
                membership.id.referenceName = this.getApplicationName(membership.id.referenceId, "<Application has been deleted>");
            } else if (membership.id.referenceType == "API") {
                membership.id.referenceName = this.getApiName(membership.id.referenceId, "<API has been deleted>");
            }
            return membership;
        });
}

/**
 * Extracts subscriptions.
 */
UserTracesExtractor.prototype.extractSubscriptions = function () {
    return db.subscriptions.find({ $or: [ {"subscribedBy" : this.userId}, {"processedBy": this.userId} ]}).sort({createdAt: 1})
        .map(item => Object.assign({
            id: item._id,
            api: item.api,
            apiName: this.getApiName(item.api, "<API has been deleted>"),
            application: item.application,
            applicationName: this.getApplicationName(item.application, "<Application has been deleted>"),
            plan: item.plan,
            planName: this.getPlanName(item.plan, "<Plan has been deleted>"),
            status: item.status,
            processedAt: item.processedAt,
            processedBy: item.processedBy,
            subscribedBy: item.subscribedBy,
            startingAt: item.startingAt,
            createdAt: item.createdAt
        }));
}

/**
 * Main entry point
 */
UserTracesExtractor.prototype.run = function () {
    this.traces.audits = this.extractAudits();
    this.traces.events =  this.extractEvents();
    this.traces.memberships =  this.extractMemberships();
    this.traces.subscriptions =  this.extractSubscriptions();

    info('User ID: "' + this.userId + '", extracted traces: ' + JSON.stringify(this.traces, null, 4));
};

/**
 * Parse a JSON string recursively.
 *
 * @param jsonValue the JSON string value to parse.
 */
function deepParseJSON(jsonValue) {
    var root = JSON.parse(jsonValue);
    for (child in root) {
        var childValue = root[child];
        if (typeof childValue === 'string' && (childValue.startsWith("{") && childValue.endsWith("}") || childValue.startsWith("[") && childValue.endsWith("]"))) {
            root[child] = deepParseJSON(root[child]);
        }
    }
    return root;
}

/**
 * Log a message according to the given level
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
 */
function checkMainArguments() {
    if (!this.sourceId && !this.email) {
        error('One of "sourceId" or "email" parameters is missing');
    }
    if (this.sourceId && this.email) {
        error('Both "sourceId" and "email" parameters are specified');
    }
}

/**
 * The main entry point
 */
function main() {
    checkMainArguments();
    var userTracesExtractor = new UserTracesExtractor(this.sourceId, this.email);
    userTracesExtractor.run();
}

// Entry point execution
main();
