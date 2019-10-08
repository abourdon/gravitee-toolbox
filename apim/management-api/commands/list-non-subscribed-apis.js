const CliCommand = require('./lib/cli-command');
const { filter, flatMap, map } = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * List all APIs with no active subscription by displaying their name, context path, owner name and owner email.
 *
 * @author Alexandre Carbenay
 */
class ListNonSubscribedApis extends CliCommand {

    constructor() {
        super(
            'list-non-subscribed-apis',
            {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.listApisBasics({
                            byName: this.argv['filter-by-name'],
                            byContextPath: this.argv['filter-by-context-path']
                        }, NO_DELAY_PERIOD)),
                flatMap(api => managementApi.getApiSubscriptions(api.id).pipe(
                    filter(subscriptions => subscriptions.data.length == 0),
                    map(subscriptions => api)
                ))
            )
            .subscribe(this.defaultSubscriber(
                api => this.displayRaw(util.format('[%s, %s, %s <%s>] %s',
                    api.id,
                    api.context_path,
                    api.owner.displayName,
                    api.owner.email,
                    api.name
                ))
            ));
    }
}

new ListNonSubscribedApis().run();
