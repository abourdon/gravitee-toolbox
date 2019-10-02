const SimpleLDAP = require('simple-ldap-search').default;
const { defer } = require('rxjs');
const { map } = require('rxjs/operators');
const util = require('util');

/*
 * LDAP attributes to retrieve from the LDAP server:
 * - cn: user common name (lastname and firstname)
 * - uid: user identifier
 */
const LDAP_ATTRIBUTES = ['cn','uid'];

/**
 * LDAP client instance. This instance initializes an LDAP session on construction, that must be closed after usage, using close() method.
 *
 * @author Alexandre Carbenay
 */
class LdapClient {

    /**
     * Creates a new LDAP client instance according to the given settings
     *
     * @param {object} ldapSettings settings of this LDAP client instance
     */
    constructor(ldapSettings) {
        this.settings = ldapSettings;

        this._init();
    }

    /**
     * Initializes an LDAP session.
     */
    _init() {
        const config = {
            url: this.settings.ldapUrl,
            base: this.settings.ldapBase,
            dn: this.settings.ldapUsername,
            password: this.settings.ldapPassword,
        };
        this.ldap = new SimpleLDAP(config);
    }

    /**
     * Searches for LDAP entries based on the given filter and return given attributes for each entry.
     *
     * @param {string} filter the search filter
     * @param {array} attributes the attributes to return for found entries
     */
    search(filter, attributes) {
        return defer(async function() {
            return await this.ldap.search(filter, attributes);
        }.bind(this));
    }

    /**
     * Searches for LDAP user based on UID.
     * If no user has been found, return an empty user with all fields having default values except uid.
     *
     * @param {string} uid the user ID
     */
    searchUser(uid) {
        const filter = util.format('(uid=%s)', uid);
        return this.search(filter, LDAP_ATTRIBUTES).pipe(
            map(results => {
                if (results.length > 1) {
                    this.displayError(util.format("LDAP search returned no unique result for filter '%s': %s", filter, results));
                }
                return results.length >= 1 ? results[0] : this._emptyUser(uid);
            })
        );
    }

    /**
     * Closes the LDAP client session.
     */
    close() {
        this.ldap.destroy();
    }

    /**
     * Display an error message
     *
     * @param {string} message the error message to display
     */
    displayError(message) {
        console.error(util.format('%s: Error: %s', this.name, message));
    }

    _emptyUser(uid) {
        return {
            dn: '',
            cn: '',
            uid: uid
        };
    }

}

/**
 * Associated settings to any ManagementAPI instance
 */
LdapClient.Settings = class {
    constructor(ldapUrl, ldapUsername, ldapPassword, ldapBase) {
        this.ldapUrl = ldapUrl;
        this.ldapUsername = ldapUsername;
        this.ldapPassword = ldapPassword;
        this.ldapBase = ldapBase;
    }
};

module.exports = {
    Settings: LdapClient.Settings,
    createInstance: function(settings) {
        return new LdapClient(settings);
    }
};