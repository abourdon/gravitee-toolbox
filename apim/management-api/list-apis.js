const ManagementApiScript = require('./lib/management-api-script');
const { flatMap } = require('rxjs/operators');
const util = require('util')

/**
 * List all registered APIs by displaying their name and context path.
 * 
 * @author Aurelien Bourdon
 */
class ListApis extends ManagementApiScript.ManagementApiScript {
    definition(managementApi) {
        managementApi
            .login()
            .pipe(
                flatMap(_token => managementApi.listApis()),
                flatMap(api => managementApi.export(api.id))
            )
            .subscribe(
                api => console.log(util.format('%s (%s)', api.name, api.proxy.context_path)),
                error => {
                    this.displayError(error);
                    process.exit(1)
                },
                _complete => {
                    this.displayInfo('Operation complete.')
                });
    }
}
new ListApis('list-apis').run();