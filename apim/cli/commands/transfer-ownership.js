const {CliCommand} = require('./lib/cli-command');
const StringUtils = require('./lib/string-utils');
const Rx = require('rxjs');
const {flatMap, map, reduce, switchMap, tap} = require('rxjs/operators');
const util = require('util');
const readline = require('readline');

/**
 * Transfer APIs and applications ownership based on user predicate
 *
 * @author Alexandre Carbenay
 */
class TransferOwnership extends CliCommand {

    constructor() {
        super(
            'transfer-ownership',
            'Transfer APIs and applications ownership based on user predicate',
            {
                'type': {
                    describe: 'Indicates which type of element is managed (either api or application)',
                    choices: ['api', 'application'],
                    default: 'api'
                },
                'filter-by-name': {
                    describe: 'Filter APIs or applications against their name (insensitive regex)'
                },
                'filter-by-primary-owner': {
                    describe: "Filter APIs against its primary owner name or address (insensitive regex)",
                    type: 'string'
                },
                'owner': {
                    describe: 'Owner search term (either name or LDAP UID)',
                    demandOption: true
                },
                'old-owner-role': {
                    describe: 'Role to be assigned to the previous owner of the API',
                    choices: ['USER', 'OWNER'],
                    default: 'USER'
                },
                'ask-for-approval': {
                    describe: "Ask for user approval before transferring owernship",
                    type: 'boolean',
                    default: true
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            // Retrieve owner and APIs
            .pipe(
                flatMap(_token => this.getOwner(managementApi)),
                flatMap(owner => this.getApisOrApplications(managementApi, owner))
            )
            // Then ask for confirmation for applying changes
            .subscribe(
                ownershipTransfer => {
                    if (this.argv['ask-for-approval']) {
                        this.askForApproval(
                            ownershipTransfer.ownedElements.map(ownedElement => util.format("%s (%s)", ownedElement.name, ownedElement.id)),
                            this.applyTransferOwnership.bind(this, ownershipTransfer, managementApi),
                            this.handleError.bind(this, 'Aborted.')
                        );
                    } else {
                        this.applyTransferOwnership(ownershipTransfer, managementApi);
                    }
                },
                this.handleError.bind(this),
                _complete => {
                }
            );
    }

    getOwner(managementApi) {
        return managementApi.searchUsers(this.argv['owner']).pipe(
            reduce((acc, result) => acc.concat(result), []),
            switchMap(users => users.length == 1
                ? Rx.of(users[0])
                : Rx.throwError(util.format('None or too much result while searching for new owner with search term "%s"', this.argv['owner']))
            )
        );
    }

    getApisOrApplications(managementApi, owner) {
        return (this.argv['type'] == 'api' ?
            managementApi.listApisBasics({
                byName: this.argv['filter-by-name'],
                byPrimaryOwner: this.argv['filter-by-primary-owner']
            }, 0) :
            managementApi.listApplications({
                byName: this.argv['filter-by-name'],
                byPrimaryOwner: this.argv['filter-by-primary-owner']
            }, 0))
            .pipe(
                reduce((acc, element) => acc.concat(element), []),
                map(elements => Object.assign({ownedElements: elements, owner: owner})),
                tap(ownershipTransfer => this.displayInfo(util.format("Ownership transfer to '%s' asked for %d %ss",
                    ownershipTransfer.owner.displayName, ownershipTransfer.ownedElements.length, this.argv['type'])))
            );
    }

    applyTransferOwnership(ownershipTransfer, managementApi) {
        Rx.from(ownershipTransfer.ownedElements)
            .pipe(
                flatMap(element => managementApi.transferOwnership(element.id, this.argv['type'], ownershipTransfer.owner.reference, this.argv['old-owner-role']))
            )
            .subscribe(
                this.defaultSubscriber(transfer => this.displayInfo(util.format('Ownership transferred to %s', ownershipTransfer.owner.displayName)))
            );
    }

}

new TransferOwnership().run();
