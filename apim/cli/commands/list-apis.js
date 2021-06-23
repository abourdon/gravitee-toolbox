const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const {API_PORTAL_VISBILITY, PLAN_SECURITY_TYPE} = require('./lib/management-api');
const {mergeMap, map} = require('rxjs/operators');

const NO_DELAY_PERIOD = 0;

/**
 * List all registered APIs by displaying their ID, name, context path, owner name and owner email, in CSV format.
 *
 * @author Aurelien Bourdon
 */
class ListApis extends CliCommand {

    constructor() {
        super(
            'list-apis',
            'List all registered APIs by displaying their ID, name, context path, owner name and owner email, in CSV format',
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
                'filter-by-portal-visibility': {
                    describe: 'Filter APIs against their visibility into the Portal',
                    type: 'array',
                    choices: Object.values(API_PORTAL_VISBILITY)
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
                'filter-by-plan-security-type': {
                    describe: "Filter APIs against plan type (insensitive regex)",
                    type: 'array',
                    choices: Object.values(PLAN_SECURITY_TYPE)
                },
                'filter-by-policy-technical-name': {
                    describe: 'Filter APIs against their policy technical name (insensitive regex) (see https://docs.gravitee.io/apim_policies_overview.html for more details)',
                    type: 'string'
                },
                'filter-by-policy-content': {
                    describe: 'Filter APIs against their policy content by evaluating a json path (extended) predicate (see https://docs.gravitee.io/apim_policies_overview.html and https://github.com/JSONPath-Plus/JSONPath for more details)',
                    type: 'string'
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // List APIs according to filters
                mergeMap(_token => {
                    return this.hasBasicsFiltersOnly() ?
                        managementApi.listApisBasics({
                            byName: this.argv['filter-by-name'],
                            byContextPath: this.argv['filter-by-context-path'],
                            byPrimaryOwner: this.argv['filter-by-primary-owner'],
                            byPortalVisibility: this.argv['filter-by-portal-visibility']
                        }, NO_DELAY_PERIOD) :
                        managementApi.listApisDetails({
                            byName: this.argv['filter-by-name'],
                            byContextPath: this.argv['filter-by-context-path'],
                            byPrimaryOwner: this.argv['filter-by-primary-owner'],
                            byPortalVisibility: this.argv['filter-by-portal-visibility'],
                            byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                            byEndpointName: this.argv['filter-by-endpoint-name'],
                            byEndpointTarget: this.argv['filter-by-endpoint-target'],
                            byPlanName: this.argv['filter-by-plan-name'],
                            byPlanSecurityType: this.argv['filter-by-plan-security-type'],
                            byPolicyTechnicalName: this.argv['filter-by-policy-technical-name'],
                            byPolicyContent: this.argv['filter-by-policy-content']
                        });
                }),

                // Format result so that it can be handle by CsvCliCommandReporter
                map(api => [
                    api.id,
                    api.name,
                    api.context_path,
                    api.owner.displayName,
                    api.owner.email
                ])
            )
            .subscribe(new CsvCliCommandReporter([
                'API id',
                'API name',
                'API context path',
                'API owner name',
                'API owner email'
            ], this));

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