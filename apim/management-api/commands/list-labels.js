const ManagementApiScript = require('./lib/management-api-script');
const { filter, flatMap, groupBy, map, toArray } = require('rxjs/operators');
const util = require('util');

/**
 * List labels defined on APIs.
 *
 * @author Alexandre Carbenay
 */
class ListLabels extends ManagementApiScript {

    constructor() {
        super(
            'list-labels'
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.listApis()),
                map(api => Object.assign({id: api.id, name: api.name, version: api.version, labels: api.labels})),
                filter(api => api.labels !== undefined),
                flatMap(api => api.labels.map(label => Object.assign({label: label, api: Object.assign({ id: api.id, name: api.name, version: api.version})}))),
                groupBy(labelApi => labelApi.label, labelApi => labelApi.api),
                flatMap(group => group.pipe(toArray(), map(apis => Object.assign({ label: group.key, apis: apis }))))
            )
            .subscribe(this.defaultSubscriber(
                labelApis => {
                    this.displayRaw(util.format('%s', labelApis.label));
                    labelApis.apis.sort(function(a,b){
                        return a.name.localeCompare(b.name);
                    }).forEach(api => this.displayRaw(util.format('    %s (%s) - %s', api.name, api.version, api.id)));
                }
            ));
    }
}
new ListLabels().run();
