const CliCommand = require('./lib/cli-command');
const LdapClient = require('./lib/ldap-client');
const Rx = require('rxjs');
const { count, filter, flatMap, map, reduce } = require('rxjs/operators');
const assert = require('assert').strict;
const util = require('util');

/**
 * List inactive LDAP users.
 *
 * @author Alexandre Carbenay
 */
class ListInactiveLdapUsers extends CliCommand {

    constructor() {
        super(
            'list-inactive-ldap-users',
            {
                'ldap-url': {
                    describe: 'LDAP base URL',
                    type: 'string',
                    demandOption: true
                },
                'ldap-username': {
                    describe: 'Username to connect to the LDAP',
                    type: 'string',
                    demandOption: true
                },
                'ldap-password': {
                    describe: "Username's password to connect to the LDAP",
                    type: 'string',
                    demandOption: true
                },
                'ldap-base': {
                    describe: 'LDAP search base',
                    type: 'string',
                    demandOption: true
                }
            }
        );
    }

    definition(managementApi) {
        const ldapClient = this.initLdapClient();
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.listLdapUsers()),
                flatMap(user => this.filterInactiveLdapUser(ldapClient, user)),
                map(user => Object.assign({id: user.id, email: user.email, name: user.displayName})),
                flatMap(user => this.fillUserWithApisInfo(managementApi, user)),
                flatMap(user => this.fillUserWithApplicationsInfo(managementApi, user)),
                reduce((acc, user) => util.format('%s\n%s (Email: %s, id: %s)\n\tAPIs:%s\n\tApplications:%s',
                    acc, user.name, user.email, user.id, user.apis, user.applications), '')
            )
            .subscribe(this.defaultSubscriber(
                users => {
                    this.displayRaw(util.format('Following users can be removed from Gravitee:%s', users));
                    ldapClient.close();
                },
                error => {
                    this.displayError(error);
                    ldapClient.close();
                }
            ));
    }

    initLdapClient() {
        return LdapClient.createInstance(new LdapClient.Settings(
           this.argv['ldap-url'],
           this.argv['ldap-username'],
           this.argv['ldap-password'],
           this.argv['ldap-base']
        ));
    }

    filterInactiveLdapUser(ldapClient, graviteeUser) {
        const uid = this.extractGraviteeUserUid(graviteeUser);
        return ldapClient.searchUser(uid).pipe(
            map(ldapUser => Object.assign({gravitee: graviteeUser, ldap: ldapUser})),
            filter(user => this.isInactiveInLdap(user.gravitee.displayName, user.ldap)),
            map(user => user.gravitee)
        );
    }

    extractGraviteeUserUid(user) {
        const uid = user.sourceId.substring('uid='.length, user.sourceId.indexOf(','));
        return uid;
    }

    isInactiveInLdap(username, ldapUser) {
        var active = ldapUser.dn !== '';
        this.displayInfo(active
            ? util.format("User %s has been found in LDAP", ldapUser.cn)
            : util.format("No LDAP user corresponds to user %s", username));
        return !active;
    }

    fillUserWithApisInfo(managementApi, user) {
        return this.fillUserMembershipInfo(managementApi, user, 'api',
            managementApi.getApi.bind(managementApi),
            (apis => {
                user.apis = apis;
                return user;
            })
        );
    }

    fillUserWithApplicationsInfo(managementApi, user) {
        return this.fillUserMembershipInfo(managementApi, user, 'application',
            managementApi.getApplication.bind(managementApi),
            (applications => {
                user.applications = applications;
                return user;
            })
        );
    }

    fillUserMembershipInfo(managementApi, user, elementType, getElementDetailFn, fillUserFn) {
        return managementApi.listUserMemberships(user.id, elementType).pipe(
            flatMap(elements => Rx.from(elements).pipe(
                flatMap(element => getElementDetailFn(element.id).pipe(
                    filter(element => element.owner.id == user.id)
                )),
                map(element => util.format('\t\t- %s (%s)', element.name, element.id)),
                reduce((acc, element) => util.format('%s\n%s', acc, element), '')
            )),
            map(elements => fillUserFn(elements))
        );
    }

}
new ListInactiveLdapUsers().run();