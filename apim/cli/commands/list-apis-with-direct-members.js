const {CliCommand} = require('./lib/cli-command');
const Rx = require('rxjs')
const {filter, flatMap, map, reduce, tap} = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;
const PRIMARY_OWNER_ROLE = 'PRIMARY_OWNER';

const MEMBERSHIP_RIGHTS_PRECEDENCE = ['USER', 'OWNER'];

/**
 * List all registered APIs with multiple members by displaying their name, context path, owner name and owner email,
 * plus some information about the members already existing in groups associated to API and remaining members.
 *
 * @author Alexandre Carbenay
 */
class ListApisWithDirectMembers extends CliCommand {

    constructor() {
        super(
            'list-apis-with-direct-members',
            'List all registered APIs with multiple members by displaying their name, context path, owner name and owner email, ' +
            'plus some information about the members already existing in groups associated to API and remaining members',
            {
                'delete-members': {
                    describe: "Indicate whether the script execution must delete members when possible",
                    type: 'boolean',
                    default: false
                },
                'ask-for-approval': {
                    describe: "Ask for user approval before deleting members. This option is not used if delete-members is set to false",
                    type: 'boolean',
                    default: true
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.listApisBasics()),
                flatMap(api => managementApi.getApiDirectMembers(api.id).pipe(
                    filter(members => members.length > 1),
                    flatMap(members => this.splitDeletableAndRemainingMembers(managementApi, api, members))
                )),
                tap(apiMembers => this.displayRaw(util.format('[%s, %s, %s <%s>] %s (deletable members: %s, remaining members: %s)',
                    apiMembers.api.id,
                    apiMembers.api.context_path,
                    apiMembers.api.owner.displayName,
                    apiMembers.api.owner.email,
                    apiMembers.api.name,
                    apiMembers.deletableMembers.map(m => m.displayName),
                    apiMembers.remainingMembers.map(m => m.displayName)
                ))),
                reduce((acc, apiMembers) => acc.concat(apiMembers), [])
            )
            .subscribe(
                apisMembers => {
                    if (this.argv['delete-members']) {
                        var apisDeletableMembers = apisMembers.filter(apiMembers => apiMembers.deletableMembers.length > 0);

                        if (apisDeletableMembers.length > 0 && this.argv['ask-for-approval']) {
                            this.displayRaw("");
                            this.askForApproval(
                                apisDeletableMembers.map(
                                    apiMembers => util.format(
                                        "[%s, %s, %s <%s>] %s (deletable members: %s)",
                                        apiMembers.api.id,
                                        apiMembers.api.context_path,
                                        apiMembers.api.owner.displayName,
                                        apiMembers.api.owner.email,
                                        apiMembers.api.name,
                                        apiMembers.deletableMembers.map(m => m.displayName)
                                    )
                                ),
                                this.deleteApisDeletableMembers.bind(this, managementApi, apisDeletableMembers),
                                this.handleError.bind(this, 'Aborted.')
                            );
                        } else {
                            this.deleteApisDeletableMembers(managementApi, apisDeletableMembers);
                        }
                    }
                },
                this.handleError.bind(this),
                _complete => {
                }
            );
    }

    splitDeletableAndRemainingMembers(managementApi, api, members) {
        return managementApi.getApi(api.id).pipe(
            flatMap(detail => this.getDeletableAndRemainingMembers(managementApi, detail, members)),
            map(members => Object.assign({
                api: api,
                deletableMembers: members.filter(m => m.deletable),
                remainingMembers: members.filter(m => !m.deletable)
            }))
        );
    }

    getDeletableAndRemainingMembers(managementApi, api, members) {
        return (api.groups !== undefined && api.groups.length > 0)
            ? this.getApiGroupsMembers(managementApi, api.groups).pipe(
                flatMap(groupMembers => Rx.from(members).pipe(
                    filter(member => member.role !== PRIMARY_OWNER_ROLE),
                    map(member => this.setMemberDeletable(member, groupMembers)),
                    reduce((acc, member) => acc.concat(member), [])
                ))
            )
            : Rx.of(members.filter(member => member.role !== PRIMARY_OWNER_ROLE));
    }

    getApiGroupsMembers(managementApi, groups) {
        return Rx.from(groups).pipe(
            flatMap(groupId => managementApi.getGroupMembers(groupId)),
            reduce((acc, members) => acc.concat(members), []),
            map(members => this.cleanDuplicates(members))
        );
    }

    setMemberDeletable(member, groupMembers) {
        member.deletable = groupMembers
            .filter(m => m.displayName == member.displayName)
            .filter(m => m.roles.API === member.role || (
                MEMBERSHIP_RIGHTS_PRECEDENCE.includes(m.roles.API) &&
                MEMBERSHIP_RIGHTS_PRECEDENCE.includes(member.role) &&
                MEMBERSHIP_RIGHTS_PRECEDENCE.indexOf(m.roles.API) >= MEMBERSHIP_RIGHTS_PRECEDENCE.indexOf(member.role))
            ).length > 0;
        return member;
    }

    cleanDuplicates(members) {
        const membersGroupedById = members.reduce((membersById, member) => {
            (membersById[member.id] = membersById[member.id] || []).push(member);
            return membersById;
        }, {});
        const cleanedMembers = new Array();
        for (var id in membersGroupedById) {
            cleanedMembers.push(this.getHighestRightsMembership(membersGroupedById[id]));
        }
        return cleanedMembers;
    }

    getHighestRightsMembership(memberships) {
        var highestRights = memberships[0];
        for (var index = 1; index < memberships.length; index++) {
            const current = memberships[index];
            if (MEMBERSHIP_RIGHTS_PRECEDENCE.indexOf(current.roles.API) > MEMBERSHIP_RIGHTS_PRECEDENCE.indexOf(highestRights.roles.API)) {
                highestRights = current;
            }
        }
        return highestRights;
    }

    deleteApisDeletableMembers(managementApi, apisMembers) {
        Rx.from(apisMembers).pipe(
            flatMap(apiMembers => Rx.from(apiMembers.deletableMembers).pipe(
                flatMap(member => managementApi.deleteApiDirectMember(apiMembers.api.id, member.id)),
                map(memberId => Object.assign({api: apiMembers.api.name, member: memberId}))
            ))
        )
            .subscribe(this.defaultSubscriber(apiMember => this.displayRaw(
                util.format('Member with ID %s deleted from API %s', apiMember.member, apiMember.api)
            )));
    }
}

new ListApisWithDirectMembers().run();
