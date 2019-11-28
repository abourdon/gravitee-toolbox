const {CliCommand} = require('./lib/cli-command');
const { flatMap } = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * List all registered Applications by displaying their name, owner name and owner email.
 * 
 * @author Aurelien Bourdon
 */
class ListApplications extends CliCommand {

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
                app => this.displayRaw(util.format('[%s, %s <%s>] %s',
                    app.id,
                    app.owner.displayName,
                    app.owner.email,
                    app.name
                ))
            ));
    }
}
new ListApplications().run();