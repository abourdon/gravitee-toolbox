const ManagementApiScript = require('./lib/management-api-script');
const { flatMap } = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * List all registered Applications by displaying their name, owner name and owner email.
 * 
 * @author Aurelien Bourdon
 */
class ListApplications extends ManagementApiScript {

    constructor() {
        super(
            'list-applications'
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(() => managementApi.listApplications(NO_DELAY_PERIOD))
            )
            .subscribe(this.defaultSubscriber(
                app => this.displayRaw(util.format('%s (%s <%s>)', app.name, app.owner.displayName, app.owner.email))
            ));
    }
}
new ListApplications().run();