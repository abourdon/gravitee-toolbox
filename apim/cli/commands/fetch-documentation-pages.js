const {CliCommand} = require('./lib/cli-command');
const Rx = require('rxjs');
const { filter, flatMap, map, reduce } = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * Fetches the documentation pages for APIs.
 *
 * @author Alexandre Carbenay
 */
class FetchDocumentationPages extends CliCommand {

    constructor() {
        super(
            'fetch-documentation-pages',
            'Fetches the documentation pages for APIs',
            {
                'api-id': {
                    describe: 'API UUID',
                    type: 'string'
                },
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
                'filter-by-page-name': {
                    describe: 'Filter documentation pages by name (insensitive regex)',
                    type: 'string'
                },
                'filter-by-page-type': {
                    describe: 'Filter documentation pages by type',
                    type: 'string',
                    enum: ['SWAGGER', 'MARKDOWN']
                },
                'ask-for-approval': {
                    describe: "Ask for user approval before fetching documentation",
                    type: 'boolean',
                    default: true
                },
                'delay-period': {
                    describe: "Delay period to temporize API broadcast",
                    type: 'number',
                    default: 50
                }
            }
        );
    }

    definition(managementApi) {
        managementApi.login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => this.argv['api-id'] ?
                    managementApi.getApi(this.argv['api-id']) :
                    managementApi.listApisBasics({
                        byName: this.argv['filter-by-name'],
                        byContextPath: this.argv['filter-by-context-path'],
                        byPrimaryOwner: this.argv['filter-by-primary-owner']
                    }, this.argv['delay-period'])
                ),
                flatMap(api => {
                    return managementApi.getDocumentationPages(api.id, {
                        byName: this.argv['filter-by-page-name'],
                        byType: this.argv['filter-by-page-type']
                    }).pipe(
                        filter(page => page.source !== undefined),
                        map(page => Object.assign({ api: api, page: page }))
                    );
                }),
                reduce((acc, apiPage) => acc.concat(apiPage), [])
            )
            .subscribe(
                apiPages => {
                if (this.argv['ask-for-approval']) {
                    this.askForApproval(
                        apiPages.map(
                            apiPage => util.format(
                                "Documentation page '%s' of API '%s'",
                                apiPage.page.name,
                                apiPage.api.name
                            )
                        ),
                        this.fetchDocumentationPages.bind(this, apiPages, managementApi),
                        this.handleError.bind(this, 'Aborted.')
                    );
                    } else {
                    this.fetchDocumentationPages(apiPages, managementApi);
                    }
                },
                this.handleError.bind(this),
                _complete => {
                }
            );
    }

    /**
     * Last step of the script definition: fetch documentation pages
     *
     * @param {object} apiPages the pages to fetch
     * @param {object} managementApi the ManagementApi instance from which request for Management API resources
     */
    fetchDocumentationPages(apiPages, managementApi) {
        Rx.from(apiPages).pipe(
            flatMap(apiPage => managementApi.fetchDocumentationPage(apiPage.api.id, apiPage.page.id).pipe(
                    map(fetchedPage => apiPage)
            ))
        ).subscribe(this.defaultSubscriber(apiPage => this.displayRaw(
            util.format("- Operation done for documentation page '%s' for API '%s'",
                apiPage.page.name,
                apiPage.api.name
            )
        )));
    }

}
new FetchDocumentationPages().run();
