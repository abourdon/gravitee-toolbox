/*
 * Set a primary owner to any reference (API, Application) that misses it.
 *
 * Prerequisites:
 * - Have a registered sourceId that will be used as primary owner for any orphan reference
 * - Have a registered sourceId that will be used as the operator who is responsible of changes
 *
 * Mandatory command line arguments:
 * - referenceType the reference type to scan (either 'api' or 'app')
 * - primaryOwner the sourceId that will be used as primary owner for any orphan Application
 * - operator the sourceId responsible of the transfer (should be an administrator)
 *
 * Can be executed as the following: mongo [OPTIONS] --eval "const referenceType='api', primaryOwner='foo', operator='bar';" set-primary-owner-orphans_1.25.x.js
 *
 * /!\ Tested with Gravitee v1.25.x /!\
 * /!\ Dump your Mongo database before any operation! /!\
 *
 * @author Aurelien Bourdon
 */

const REFERENCE_TYPES = {
    'api': {
        id: 3,
        name: 'API',
        collection: 'apis'
    },
    'app': {
        id: 4,
        name: 'APPLICATION',
        collection: 'applications'
    }
};

const PRIMARY_OWNER_MEMBERSHIP_ROLE_PATTERN = /\d:PRIMARY_OWNER/;

/**
 * The OrphanApplicationsSetter is where operation will be done. It owns a set of context variables which are necessary to apply changes
 *
 * @param referenceType the reference type to scan (either 'api' or 'app')
 * @param primaryOwner the username that will be used as primary owner for any orphan Application
 * @param operator the username responsible of the transfer (should be an administrator)
 * @constructor
 */
function PrimaryOwnerOrphansSetter(referenceType, primaryOwner, operator) {
    this.referenceType = REFERENCE_TYPES[referenceType];
    this.primaryOwner = primaryOwner;
    this.operator = operator;

    this.init();
}

/**
 * Initializes an OrphanApplicationsSetter
 */
PrimaryOwnerOrphansSetter.prototype.init = function () {
    // Set the operator identifier
    const knownOperator = db.users.findOne({'sourceId': this.operator});
    if (!knownOperator) {
        error('Operator "' + this.operator + '" cannot be found');
    }
    this.operatorId = knownOperator._id;

    // Set the primary owner identifier
    const knownPrimaryOwner = db.users.findOne({'sourceId': this.primaryOwner});
    if (!knownPrimaryOwner) {
        error('Primary owner "' + this.primaryOwner + '" cannot be found');
    }
    this.primaryOwnerId = knownPrimaryOwner._id;

    // Set the now date
    this.now = ISODate();
};

/**
 * Get all context reference type entries without primary owner
 */
PrimaryOwnerOrphansSetter.prototype.getReferenceEntriesWithoutPrimaryOwner = function () {
    // Get reference type entries
    const referenceTypeEntries = db[this.referenceType.collection].find();
    const referenceTypeEntriesWithoutPrimaryOwner = [];
    // Find primary owner orphan for each reference type entries
    while (referenceTypeEntries.hasNext()) {
        const referenceEntry = referenceTypeEntries.next();
        const referenceEntryMemberships = db.memberships.find({
            $and: [
                {'_id.referenceType': this.referenceType.name},
                {'_id.referenceId': referenceEntry._id}
            ]
        });
        // Find primary owner orphan within membership
        let primaryOwnerFound = false;
        while (!primaryOwnerFound && referenceEntryMemberships.hasNext()) {
            const membership = referenceEntryMemberships.next();
            const primaryOwnerMembership = membership.roles.find(role => PRIMARY_OWNER_MEMBERSHIP_ROLE_PATTERN.test(role));
            primaryOwnerFound = primaryOwnerMembership !== undefined;
        }
        // If primary owner cannot be found then save it for being returned later
        if (!primaryOwnerFound) {
            referenceTypeEntriesWithoutPrimaryOwner.push(referenceEntry);
        }
    }
    return referenceTypeEntriesWithoutPrimaryOwner;
};

/**
 * Set the primary owner of the given reference id according to the context reference type
 *
 * Setting the primary owner causes:
 * - add the primary owner membership entry
 * - add the audit associated to the membership entry insert
 *
 * @param referenceId the reference type identifier to add
 */
PrimaryOwnerOrphansSetter.prototype.setPrimaryOwnerToOrphanReference = function (referenceId) {

    /**
     * Insert primary owner membership
     *
     * @returns {boolean} true if operation succeeds, false otherwise
     */
    function insertMembership() {
        // Check if primary owner can be inserted
        const membershipId = {
            "userId": this.primaryOwnerId,
            "referenceId": referenceId,
            "referenceType": this.referenceType.name
        };
        const membershipAlreadyExist = db.memberships.find({
            $and: [
                {'_id.userId': membershipId.userId},
                {'_id.referenceId': membershipId.referenceId},
                {'_id.referenceType': membershipId.referenceType}
            ]
        });
        if (membershipAlreadyExist.hasNext()) {
            error('Unable to set primary owner for reference ' + referenceId + ' because given primary owner is already a member of this reference', false);
            return false;
        }
        // Insert the primary owner membership
        try {
            const membershipInsert = db.memberships.insertOne({
                "_id": membershipId,
                "roles": [this.referenceType.id + ":PRIMARY_OWNER"],
                "createdAt": this.now,
                "updatedAt": this.now,
                "_class": "io.gravitee.repository.mongodb.management.internal.model.MembershipMongo"
            });
            if (!membershipInsert.insertedId || membershipInsert.insertedId.referenceId !== referenceId) {
                throw 'Unable to set primary owner for orphan reference ' + referenceId + '. Rollback changes...';
            }
        } catch (e) {
            error(e, false);
            error('Rollback changes for reference ' + referenceId + '...', false);
            this.rollbackPrimaryOwnerToOrphanReferenceSet(membershipId);
            return false;
        }
        return true;
    }

    /**
     * Insert audit entry related to membership insert
     */
    function insertAudit() {
        // Insert audit associated to primary owner membership insert
        const auditId = ObjectId().valueOf();
        try {
            let status = db.audits.insertOne({
                "_id": auditId,
                "referenceId": referenceId,
                "referenceType": this.referenceType.name,
                "user": this.operatorId,
                "event": "MEMBERSHIP_CREATED",
                "properties": {"USER": this.primaryOwnerId},
                "patch": "[{\"op\":\"add\",\"path\":\"/referenceId\",\"value\":\"" + referenceId + "\"},{\"op\":\"add\",\"path\":\"/referenceType\",\"value\":\"" + this.referenceType.name + "\"},{\"op\":\"add\",\"path\":\"/roles\",\"value\":{\"" + this.referenceType.id + "\":\"PRIMARY_OWNER\"}},{\"op\":\"add\",\"path\":\"/userId\",\"value\":\"" + this.operatorId + "\"}]",
                "createdAt": this.now,
                "_class": "io.gravitee.repository.mongodb.management.internal.model.AuditMongo"
            });
            if (status.insertedId !== auditId) {
                throw 'Unable to insert audit associated to primary owner key creation. Rollback changes...';
            }
        } catch (e) {
            error(e, false);
            error('Rollback changes...', false);
            this.rollbackPrimaryOwnerToOrphanReferenceSet(membershipId, auditId);
        }
    }

    if (insertMembership.bind(this)()) {
        insertAudit.bind(this)();
    }
};

/**
 * Rollback changes related to primary owner set
 *
 * @param membershipId the membership entry identifier to rollback
 * @param auditId the audit entry identifier to rollback (if necessary)
 */
PrimaryOwnerOrphansSetter.prototype.rollbackPrimaryOwnerToOrphanReferenceSet = function (membershipId, auditId) {
    if (auditId) {
        try {
            const removeStatus = db.audits.remove({'_id': auditId});
            if (!removeStatus || !removeStatus.nRemoved || removeStatus.nRemoved !== 1) {
                throw 'Unable to rollback audit insert due to status ' + JSON.stringify(removeStatus);
            }
        } catch (e) {
            error("Rollback on audits collection cannot be fully applied: " + e, false);
        }
    }
    if (membershipId) {
        try {
            const removeStatus = db.memberships.remove({
                $and: [
                    {'_id.userId': membershipId.userId},
                    {'_id.referenceId': membershipId.referenceId},
                    {'_id.referenceType': membershipId.referenceType}
                ]
            });
            if (!removeStatus || !removeStatus.nRemoved || removeStatus.nRemoved !== 1) {
                throw 'Unable to rollback membership insert due to status ' + JSON.stringify(removeStatus);
            }
        } catch (e) {
            error("Rollback on memberships collection cannot be fully applied: " + e, false);
        }
    }
};

/**
 * Main entry point
 */
PrimaryOwnerOrphansSetter.prototype.run = function () {
    info('Find and set primary owner to orphan reference type entries...');
    this.getReferenceEntriesWithoutPrimaryOwner().forEach(orphan => {
        info('Setting primary owner for orphan entry ' + orphan._id + '...');
        this.setPrimaryOwnerToOrphanReference(orphan._id);
    });
    info('Done.');
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
 * - referenceType
 * - operator
 * - primaryOwner
 */
function checkMainArguments() {
    if (!this.referenceType || !REFERENCE_TYPES.hasOwnProperty(this.referenceType)) {
        error('"referenceType" parameter is missing or not correctly typed. Possible values: ' + Object.keys(REFERENCE_TYPES));
    }

    if (!this.operator) {
        error('"operator" parameter is missing');
    }

    if (!this.primaryOwner) {
        error('"primaryOwner" parameter is missing');
    }
}

/**
 * The main entry point
 */
function main() {
    checkMainArguments();
    new PrimaryOwnerOrphansSetter(this.referenceType, this.primaryOwner, this.operator).run();
}

// Entry point execution
main();
