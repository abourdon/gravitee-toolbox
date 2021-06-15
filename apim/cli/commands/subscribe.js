const {CliCommand, CliCommandPrerequisites, CliCommandReporter} = require('./lib/cli-command');
const {PLAN_STATUS, PLAN_SECURITY_TYPE} = require('./lib/management-api');
const {mergeMap, map, merge} = require('rxjs/operators');
const util = require('util');
const Rx = require('rxjs');

const FILTERS = {
    APIs: {
        'filter-apis-by-id': {
            describe: 'Filter APIs against their ids (insensitive regex)',
            type: 'string'
        },
        'filter-apis-by-name': {
            describe: 'Filter APIs against their name (insensitive regex)',
            type: 'string'
        },
        'filter-apis-by-context-path': {
            describe: 'Filter APIs against their context-path (insensitive regex)',
            type: 'string'
        },
        'filter-apis-by-primary-owner': {
            describe: 'Filter APIs against their primary owner name and/or email (insensitive regex)',
            type: 'string'
        }
    },
    Applications: {
        'filter-applications-by-id': {
            describe: 'Filter Applications against their ids (insensitive regex)',
            type: 'string'
        },
        'filter-applications-by-name': {
            describe: 'Filter Applications against their name (insensitive regex)',
            type: 'string'
        }
    },
    Plans: {
        'filter-plans-by-name': {
            describe: 'Filter API plans (currently published) against their name (insensitive regex)',
            type: 'string'
        }
    }
};

/**
 * Massively subscribe a set of Applications to a given set of APIs' Plans
 *
 * @author Aurelien Bourdon
 */
class Subscribe extends CliCommand {

    constructor() {
        super(
            'subscribe',
            "Massively subscribe a set of Applications to a given set of APIs' Plans",
            Object.assign(
                {
                    'ask-for-approval': {
                        describe: 'Ask for user approval before applying subscriptions',
                        type: 'boolean',
                        default: true
                    }
                },
                {
                    'auto-validate-subscriptions': {
                        describe: 'Automatically validate subscription (be careful to have rights on APIs)',
                        type: 'boolean',
                        default: true
                    }
                },
                Object.keys(FILTERS).reduce((acc, filterType) => Object.assign(acc, FILTERS[filterType]), {})
            )
        );
    }

    checkPrerequisites() {
        /**
         * Check if the filter type (#FILTERS keys) has been filled out by user
         *
         * @param filterType the filter type to check
         * @returns {boolean} true if the given filter type has been filled out by user, false otherwise
         */
        function hasFilterTypeBeenFilledOut(filterType) {
            return Object.keys(FILTERS[filterType]).reduce(
                (acc, filter) => acc || this.argv[filter],
                false
            );
        }

        // Check if there is at least one filter by filter type (APIs, Applications, Plans) that has been filled out by user
        Object.keys(FILTERS).forEach(filterType => {
            if (!hasFilterTypeBeenFilledOut.bind(this)(filterType)) {
                this.console.warn(util.format("No filter has been defined to select %s. All records are returned.", filterType));
            }
        });
        return CliCommandPrerequisites.createSatisfied();
    }

    definition(managementApi) {
        // Get plans according to filters
        const plans = managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // List APIs according to filters
                mergeMap(_token => managementApi.listApisBasics
                    (
                        {
                            byId: this.argv['filter-apis-by-id'],
                            byName: this.argv['filter-apis-by-name'],
                            byContextPath: this.argv['filter-apis-by-context-path'],
                            byPrimaryOwner: this.argv['filter-apis-by-primary-owner']
                        }
                    )
                ),

                // Enrich APIs with their associated Plans according to filters in order to easily manipulate it further (see AskForApprovalReporter#complete())
                mergeMap(api => managementApi.getApiPlans(api.id, [PLAN_STATUS.PUBLISHED], [PLAN_SECURITY_TYPE.KEYLESS], {byName: this.argv['filter-plans-by-name']})
                    .pipe(
                        map(plan => {
                            return {
                                type: 'plans',
                                data: {
                                    api: api,
                                    plan: plan
                                }
                            }
                        })
                    )
                )
            );
        // Get applications according to filters
        const applications = managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // List Applications according to filters
                mergeMap(_token => managementApi.listApplications(
                    {
                        byId: this.argv['filter-applications-by-id'],
                        byName: this.argv['filter-applications-by-name']
                    }
                )),

                // Then wrap result to be able to manipulate it easily further (see AskForApprovalReporter#complete())
                map(application => {
                    return {
                        type: 'applications',
                        data: application
                    }
                })
            );

        // Merge plans and applications to get ready to process subscriptions
        Rx
            .from(plans)
            .pipe(
                merge(applications)
            )
            .subscribe(new AskForApprovalReporter(this, managementApi));
    }
}

/**
 * Intermediary reporter to ask for user approval if necessary.
 *
 * @author Aurelien Bourdon
 */
class AskForApprovalReporter extends CliCommandReporter {

    constructor(cliCommand) {
        super(cliCommand);
        this.entitiesToProcess = {
            applications: [],
            plans: []
        };
        this.subscriptionsToProcess = [];
    }

    doNext(next) {
        this.entitiesToProcess[next.type].push(next.data);
    }

    complete() {
        // Retrieve all subscriptions to process based on received applications and plans (enriched with APIs)
        this.entitiesToProcess.applications.forEach(application =>
            this.entitiesToProcess.plans.forEach(plan =>
                this.subscriptionsToProcess.push({
                    api: plan.api,
                    plan: plan.plan,
                    application: application
                })
            )
        );

        // Ask for user approval if necessary
        if (this.cliCommand.argv['ask-for-approval']) {
            this.cliCommand.askForApproval(
                this.subscriptionsToProcess.map(subscriptionToProcess => this._formatSubscriptionToProcessLog(
                    subscriptionToProcess,
                    "Application '%s' (%s) will subscribe to API '%s' (%s) through plan '%s' (%s)"
                )),
                this.applySubscriptions.bind(this),
                this.endWithoutApplyingSubscriptions.bind(this),
                util.format('The following subscriptions will be applied%s', this.cliCommand.argv['auto-validate-subscriptions'] ? ' (and subscriptions will be automatically validated)' : '')
            )
        } else {
            this.applySubscriptions();
        }
    }

    /**
     * Terminate process without applying subscriptions (in case of refusal)
     */
    endWithoutApplyingSubscriptions() {
        // Nothing to do
    }

    /**
     * Finally apply subscriptions
     */
    applySubscriptions() {
        if (this.subscriptionsToProcess.length === 0) {
            this.cliCommand.displayWarning('No entries can be found following your search criteria. Please refine your search.');
            return;
        }
        // For each subscriptions to process...
        this.subscriptionsToProcess.forEach(subscriptionToProcess =>
            // Process it (this way, if a reactive error arise, the whole process is not broke)
            this.cliCommand.managementApi
                .subscribe(subscriptionToProcess.application.id, subscriptionToProcess.plan.id)
                .pipe(
                    // ... and directly validate subscription if desired
                    mergeMap(subscription => this.cliCommand.argv['auto-validate-subscriptions'] ?
                        this.cliCommand.managementApi.validateSubscription(subscriptionToProcess.api.id, subscription.id) :
                        Rx.of(subscription)
                    )
                )
                .subscribe(
                    next => this.cliCommand.displayInfo(this._formatSubscriptionToProcessLog(subscriptionToProcess, "Application '%s' (%s) successfully subscribed to API '%s' (%s) through plan '%s' (%s)")),
                    error => this.cliCommand.displayError(
                        util.format(
                            this._formatSubscriptionToProcessLog(subscriptionToProcess, "Unable to subscribe Application '%s' (%s) with API '%s' (%s) through plan '%s' (%s): %s"),
                            error.message
                        ))
                )
        )
    }

    _formatSubscriptionToProcessLog(subscriptionToProcess, templatedMessage) {
        return util.format(
            templatedMessage,
            subscriptionToProcess.application.name,
            subscriptionToProcess.application.id,
            subscriptionToProcess.api.name,
            subscriptionToProcess.api.id,
            subscriptionToProcess.plan.name,
            subscriptionToProcess.plan.id
        );
    }

}

new Subscribe().run();