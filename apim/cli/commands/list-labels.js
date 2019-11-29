const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const {filter, flatMap, groupBy, map, toArray} = require('rxjs/operators');
const Rx = require('rxjs');

/**
 * List labels defined on APIs, in CSV format.
 *
 * @author Alexandre Carbenay
 */
class ListLabels extends CliCommand {

    constructor() {
        super(
            'list-labels',
            'List labels defined on APIs, in CSV format'
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.listApisBasics()),
                flatMap(api => {
                    if (api.labels) {
                        return Rx.from(api.labels.map(label => [
                            label,
                            api.id,
                            api.name,
                            api.context_path,
                            api.version
                        ]));
                    }
                    return Rx.EMPTY;
                })
            )
            .subscribe(new CsvCliCommandReporter(
                [
                    'Label',
                    'API id',
                    'API name',
                    'API context path',
                    'API version'
                ],
                this
            ));
    }
}

new ListLabels().run();
