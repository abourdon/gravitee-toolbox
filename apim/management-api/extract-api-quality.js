const ManagementApiScript = require('./lib/management-api-script');
const { QualityCriterion, convertQualityCriteria } = require('./lib/quality-criteria-converter');
const Rx = require('rxjs')
const { filter, flatMap, map, reduce } = require('rxjs/operators');

const DESCRIPTION_MIN_LENGTH = 100;
const FUNCTIONAL_DOC_TYPE = "MARKDOWN";
const TECHNICAL_DOC_TYPE = "SWAGGER";

/*
 * API name is composed of:
 * - eventually a namespace (potentially multiple words)
 * - a resource or provider (potentially multiple words)
 * - eventually a country
 * Example: Multiple words namespace - Resource or provider - Country
 */
const API_NAME_REGEX = /^(\w+( \w+)* \- )?\w+( \w+)*( \- \w+)?$/;
/*
 * Version is prefixed with a "v" and composed of one or more digits
 */
const API_VERSION_REGEX = /v\d+/;
/*
 * Context path is composed of:
 * - a context (e.g. "corp" or country in 2 letters)
 * - eventually a namespace (potentially multiple words separated with - or _)
 * - a version starting with "v" and ending with digits
 * - a resource (potentially multiple words separated with - or _)
 * - eventually a sub resource (potentially multiple words separated with - or _)
 * Example: /corp/composed-namespace/v1/composed-resource/sub-resource
 */
const API_CONTEXT_PATH_REGEX = /^\/(corp|fr|lu|pl|hu|ro|pt|uk|ru|es)(\/\w+((-|_)\w+)?)?\/v\d+\/\w+((-|_)\w+)?(\/\w+((-|_)\w+)?)?$/;
/*
 * Data classification labels are composed of:
 * - a confidentiality label as C0, C1, C2 or C3
 * - an integrity label as I1, I2 or I3
 * - an availability label as A1, A2 or A3
 */
const CONFIDENTIALITY_LABEL_REGEX = /^C[0-3]$/;
const INTEGRITY_LABEL_REGEX = /^I[1-3]$/;
const AVAILABILITY_LABEL_REGEX = /^A[1-3]$/;

const matchNamingConvention = function(valueSelector, regex, apiDetail) {
    return apiDetail => {
        const matches = valueSelector(apiDetail).match(regex);
        return matches != null && matches.length > 0;
    }
}

const criterionEvaluators = [
    {
        name: "Name's naming convention complied",
        reference: "DF01",
        evaluate: matchNamingConvention(api => api.name, API_NAME_REGEX)
    },
    {
        name: "Version's naming convention complied",
        reference: "DF02",
        evaluate: matchNamingConvention(api => api.version, API_VERSION_REGEX)
    },
    {
        name: "Description's length is higher than " + DESCRIPTION_MIN_LENGTH,
        reference: "DF03",
        evaluate: api => api.description.length > DESCRIPTION_MIN_LENGTH,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        name: "Labels defined",
        reference: "DF05",
        evaluate: api => api.labels !== undefined && api.labels.length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        name: "Data classification labels complied",
        reference: "DF06",
        evaluate: api => [CONFIDENTIALITY_LABEL_REGEX, INTEGRITY_LABEL_REGEX, AVAILABILITY_LABEL_REGEX]
                                    .map(regex => matchNamingConvention(label => label, regex))
                                    .map(regexEvaluator => api.labels !== undefined &&
                                                           api.labels.filter(label => regexEvaluator(label)).length == 1)
                                    .reduce((acc, complied) => acc && complied, true)
    },
    {
        name: "Logo defined",
        reference: "DF07",
        evaluate: api => api.picture !== undefined && api.picture.length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        name: "Views defined",
        reference: "DF08",
        evaluate: api => api.views !== undefined && api.views.length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        name: "Functional documentation defined",
        reference: "DF11",
        evaluate: api => api.pages !== undefined && api.pages.filter(page => page.type === FUNCTIONAL_DOC_TYPE && page.published).length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        name: "Functional documentation published as home page",
        reference: "DF13",
        evaluate: api => api.pages !== undefined && api.pages.filter(page => page.type === FUNCTIONAL_DOC_TYPE && page.published && page.homepage).length > 0
    },
    {
        name: "Technical documentation defined",
        reference: "DF14",
        evaluate: api => api.pages !== undefined && api.pages.filter(page => page.type === TECHNICAL_DOC_TYPE && page.published).length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        name: "Context-path's naming convention complied",
        reference: "DF18",
        evaluate: matchNamingConvention(api => api.proxy.context_path, API_CONTEXT_PATH_REGEX)
    },
    {
        name: "Groups of endpoints and endpoints naming convention complied",
        reference: "DF19",
        evaluate: function(api) {
            const nonCompliantEndpoints = api.proxy.groups.filter(group =>
                group.endpoints !== undefined &&
                group.endpoints.filter(endpoint => !endpoint.name.startsWith(group.name + " - ")).length > 0);
            return nonCompliantEndpoints == null || nonCompliantEndpoints.length == 0;
        }
    },
    {
        name: "Health-check activated",
        reference: "DF20",
        evaluate: api => api.services !== undefined && api.services["health-check"] !== undefined && api.services["health-check"].enabled,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
];

/**
 * Extract quality criteria compliance corresponding to an API as a CSV content.
 *
 * @author Alexandre Carbenay
 */
class ExtractApiQuality extends ManagementApiScript {

    constructor() {
        super(
            'extract-api-quality',
            {
                'api-id': {
                    describe: "API UUID",
                    type: 'string',
                    demandOption: true
                },
                'override-gravitee-automation': {
                    describe: "Override Gravitee quality metrics with custom quality rules. This could be useful if Gravitee quality feature is not enabled",
                    type: 'boolean',
                    default: false
                }
            }
        );
    }

    definition(managementApi) {
        const qualityFunctions = Rx.of(
            this.getGraviteeQuality,
            this.evaluateQualityFromDetail,
            this.validateSupportEmailDefined);
        qualityFunctions.pipe(
            flatMap(qualityFunction => qualityFunction.bind(this)(managementApi)),
            reduce((acc, criteria) => acc.concat(criteria), [])
        ).subscribe(this.defaultSubscriber(
             criteria => {
                 this.displayInfo("CSV content:");
                 this.displayRaw(Array.from(criteria).reduce((acc, criteria) => acc + criteria.reference + ",", ""));
                 this.displayRaw(Array.from(criteria).reduce((acc, criteria) => acc + criteria.complied + ",", ""));
             }
         ));
    }

    getGraviteeQuality(managementApi) {
        return this.graviteeAutomationOverrideEnabled() ? Rx.EMPTY :
            managementApi.login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.getQuality(this.argv['api-id']).pipe(
                    map(quality => convertQualityCriteria(quality))
                ))
            );
    }

    evaluateQualityFromDetail(managementApi) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.export(this.argv['api-id']).pipe(
                    flatMap(apiDetail => Rx.from(criterionEvaluators).pipe(
                            filter(evaluator => evaluator.enabled === undefined || evaluator.enabled(this)),
                            map(evaluator => new QualityCriterion(evaluator.name, evaluator.reference, evaluator.evaluate(apiDetail))),
                            reduce((acc, criteria) => acc.concat(criteria), [])
                    ))
                ))
            );
    }

    validateSupportEmailDefined(managementApi) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.getApiMetadata(this.argv['api-id']).pipe(
                    map(metadata => {
                        const complied = metadata.filter(data => data.key === "email-support" && data.value !== undefined && data.value.length > 0).length > 0;
                        return new QualityCriterion("Support email address defined", "DF17", complied);
                    })
                ))
            );
    }

    graviteeAutomationOverrideEnabled() {
        return this.argv['override-gravitee-automation'];
    }

}
new ExtractApiQuality().run();