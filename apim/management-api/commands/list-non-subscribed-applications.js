const CliCommand = require('./lib/cli-command');
const { filter, flatMap, map } = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * List all applications with no active subscription by displaying their name, owner name and owner email.
 *
 * @author Alexandre Carbenay
 */
class ListNonSubscribedApplications extends CliCommand {

    constructor() {
        super(
            'list-non-subscribed-applications'
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.listApplications(NO_DELAY_PERIOD)),
                flatMap(application => managementApi.getApplicationSubscriptions(application.id).pipe(
                    filter(subscriptions => subscriptions.data.length === 0),
                    map(subscriptions => application)
                ))
            )
            .subscribe(this.defaultSubscriber(
                application => this.displayRaw(util.format('[%s, %s <%s>] %s',
                    application.id,
                    application.owner.displayName,
                    application.owner.email,
                    application.name
                ))
            ));
    }
}

new ListNonSubscribedApplications().run();
