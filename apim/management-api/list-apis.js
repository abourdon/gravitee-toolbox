const ManagementApi = require('./lib/management-api-script');
const { flatMap } = require('rxjs/operators');
const util = require('util')

/**
 * List all registered APIs by displaying their name and context path.
 * 
 * @author Aurelien Bourdon
 */
class ListApis extends ManagementApi.Script {
    get name() {
        return 'list-apis';
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.listApis(this.argv['query-filter'])),
                flatMap(api => managementApi.export(api.id))
            )
            .subscribe(this.defaultSubscriber(
                api => this.displayRaw(util.format('%s (%s)', api.name, api.proxy.context_path))
            ));
    }
}
new ListApis({
    'q': {
        alias: 'query-filter',
        describe: "String used to filter API list query (optional)",
        type: 'string'
    }
}).run();