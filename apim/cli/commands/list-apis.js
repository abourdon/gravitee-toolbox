const {CliCommand} = require('./lib/cli-command');
const {flatMap} = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * List all registered APIs by displaying their name, context path, owner name and owner email.
 *
 * @author Aurelien Bourdon
 */
class ListApis extends CliCommand {

    constructor() {
        super(
            'list-apis',
            {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                },
                'filter-by-primary-owner': {
                    describe: "Filter APIs against its primary owner name or address (insensitive regex)",
                    type: 'string'
                },
                'filter-by-endpoint-group-name': {
                    describe: "Filter APIs against endpoint group name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-endpoint-name': {
                    describe: "Filter APIs against endpoint name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-endpoint-target': {
                    describe: "Filter APIs against endpoint target (insensitive regex)",
                    type: 'string'
                },
                'filter-by-plan-name': {
                    describe: "Filter APIs against plan name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-policy-technical-name': {
                    describe: 'Filter APIs against their policy technical names (insensitive regex) (see https://docs.gravitee.io/apim_policies_overview.html for more details)'
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => {
                    return this.hasBasicsFiltersOnly() ?
                        managementApi.listApisBasics({
                            byName: this.argv['filter-by-name'],
                            byContextPath: this.argv['filter-by-context-path'],
                            byPrimaryOwner: this.argv['filter-by-primary-owner']
                        }, NO_DELAY_PERIOD) :
                        managementApi.listApisDetails({
                            byName: this.argv['filter-by-name'],
                            byContextPath: this.argv['filter-by-context-path'],
                            byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                            byEndpointName: this.argv['filter-by-endpoint-name'],
                            byEndpointTarget: this.argv['filter-by-endpoint-target'],
                            byPlanName: this.argv['filter-by-plan-name'],
                            byPolicyTechnicalName: this.argv['filter-by-policy-technical-name']
                        });
                })
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

    hasBasicsFiltersOnly() {
        return Object.keys(this.argv)
            .filter(argv => argv.startsWith("filter-by")
                && argv !== 'filter-by-name'
                && argv !== 'filter-by-context-path'
                && argv !== 'filter-by-primary-owner'
            ).length === 0;
    }
}

new ListApis().run();