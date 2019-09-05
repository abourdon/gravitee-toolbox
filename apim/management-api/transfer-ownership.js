const ManagementApiScript = require('./lib/management-api-script');
const StringUtils = require('./lib/string-utils');
const Rx = require('rxjs');
const { flatMap, map, reduce, switchMap, tap } = require('rxjs/operators');
const util = require('util');
const readline = require('readline');

/**
 * Transfer APIs and applications ownership based on user predicate
 *
 * @author Alexandre Carbenay
 */
class TransferOwnership extends ManagementApiScript {

    constructor() {
        super(
            'transfer-ownership', {
                'type': {
                    describe: 'Indicates which type of element is managed (either api or application)',
                    choices: ['api', 'application'],
                    default: 'api'
                },
                'filter-by-name': {
                    describe: 'Filter APIs or applications against their name (insensitive regex)'
                },
                'owner': {
                    describe: 'Owner search term (either name or LDAP UID)',
                    demandOption: true
                },
                'old-owner-role': {
                    describe: 'Role to be assigned to the previous owner of the API',
                    choices: ['USER', 'OWNER'],
                    default: 'USER'
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
            // Then ask for confirmation
            .subscribe(
                ownershipTransfer => {
                    if (!ownershipTransfer.ownedElements || ownershipTransfer.ownedElements.length === 0) {
                        this.displayRaw('No match found.');
                        this.displayInfo('Done.')
                        return;
                    }
                    this.askForConfirmation(managementApi, ownershipTransfer);
                },
                this.handleError.bind(this),
                _complete => {}
            );
    }

    getOwner(managementApi) {
        return managementApi.searchUsers(this.argv['owner']).pipe(
            reduce((acc, result) => acc.concat(result), []),
            switchMap(users => users.length == 1
                        ? Rx.of(users[0])
                        : Rx.throwError(util.format('None or too much result while searching for new owner with search term "%s"', this.argv['owner']))
            ),
            tap(owner => this.displayInfo(util.format("Owner: %s", owner.displayName)))
        );
    }

    getApisOrApplications(managementApi, owner) {
        return (this.argv['type'] == 'api' ?
            managementApi.listApis({
                byName: this.argv['filter-by-name'],
            }, 0) :
            managementApi.listApplications({
                byName: this.argv['filter-by-name'],
            }, 0))
        .pipe(
            reduce((acc, element) => acc.concat(element), []),
            map(elements => Object.assign({ownedElements: elements, owner: owner})),
            tap(ownershipTransfer => this.displayInfo(util.format("Ownership transfer to %s asked for %d %ss",
                ownershipTransfer.owner.displayName, ownershipTransfer.ownedElements.length, this.argv['type'])))
        );
    }

    askForConfirmation(managementApi, ownershipTransfer) {
        var question = ownershipTransfer.ownedElements.reduce(
            (acc, element) => util.format("%s\t- %s (%s)\n", acc, element.name, element.id), util.format("The following %ss match:\n", this.argv['type'])
        );
        question += util.format('These %ss ownership will be transferred to %s. Continue? (y/n) ', this.argv['type'], ownershipTransfer.owner.displayName);

        const ask = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        ask.question(question, answer => {
            // Close user interface
            ask.close();

            // If user cancels, then abort and exit
            if (answer !== 'y') {
                this.displayRaw('Aborted.');
                this.displayInfo('Done.')
                return;
            }

            // Else, apply update on filtered endpoints
            Rx.from(ownershipTransfer.ownedElements).pipe(
                flatMap(element => managementApi.transferOwnership(element.id, this.argv['type'], ownershipTransfer.owner.reference, this.argv['old-owner-role']))
            )
            .subscribe(this.defaultSubscriber(transfer => this.displayInfo(util.format('Ownership transferred to %s', ownershipTransfer.owner.displayName))));
        });
    }

}
new TransferOwnership().run();