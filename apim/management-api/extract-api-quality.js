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

// Quality criteria definition. Criteria MUST be ordered by reference alphabetical order
const criteria = {
    nameNamingConvention: {reference: "DF01", description: "Name's naming convention complied"},
    versionNamingConvention: {reference: "DF02", description: "Version's naming convention complied"},
    descriptionMinLength: {reference: "DF03", description: "Description's length higher than " + DESCRIPTION_MIN_LENGTH},
    labelsDefined: {reference: "DF05", description: "Labels defined"},
    dataClassificationLabels: {reference: "DF06", description: "Data classification labels complied"},
    logoDefined: {reference: "DF07", description: "Logo defined"},
    viewsDefined: {reference: "DF08", description: "Views defined"},
    functionalDocDefined: {reference: "DF11", description: "Functional documentation defined"},
    functionalDocHomePage: {reference: "DF13", description: "Functional documentation published as home page"},
    technicalDocDefined: {reference: "DF14", description: "Technical documentation defined"},
    supportEmailDefined: {reference: "DF17", description: "Support email address defined"},
    contextPathNamingConvention: {reference: "DF18", description: "Context-path's naming convention complied"},
    endpointsNamingConvention: {reference: "DF19", description: "Groups of endpoints and endpoints naming convention complied"},
    healthCheckActive: {reference: "DF20", description: "Health-check activated"},
}

// Quality criteria evaluators, used to evaluate quality against the API detail
const criteriaEvaluators = [
    {
        criterion: criteria.nameNamingConvention,
        evaluate: matchNamingConvention(api => api.name, API_NAME_REGEX)
    },
    {
        criterion: criteria.versionNamingConvention,
        evaluate: matchNamingConvention(api => api.version, API_VERSION_REGEX)
    },
    {
        criterion: criteria.descriptionMinLength,
        evaluate: api => api.description.length > DESCRIPTION_MIN_LENGTH,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: criteria.labelsDefined,
        evaluate: api => api.labels !== undefined && api.labels.length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: criteria.dataClassificationLabels,
        evaluate: api => [CONFIDENTIALITY_LABEL_REGEX, INTEGRITY_LABEL_REGEX, AVAILABILITY_LABEL_REGEX]
                                    .map(regex => matchNamingConvention(label => label, regex))
                                    .map(regexEvaluator => api.labels !== undefined &&
                                                           api.labels.filter(label => regexEvaluator(label)).length == 1)
                                    .reduce((acc, complied) => acc && complied, true)
    },
    {
        criterion: criteria.logoDefined,
        evaluate: api => api.picture !== undefined && api.picture.length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: criteria.viewsDefined,
        evaluate: api => api.views !== undefined && api.views.length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: criteria.functionalDocDefined,
        evaluate: api => api.pages !== undefined && api.pages.filter(page => page.type === FUNCTIONAL_DOC_TYPE && page.published).length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: criteria.functionalDocHomePage,
        evaluate: api => api.pages !== undefined && api.pages.filter(page => page.type === FUNCTIONAL_DOC_TYPE && page.published && page.homepage).length > 0
    },
    {
        criterion: criteria.technicalDocDefined,
        evaluate: api => api.pages !== undefined && api.pages.filter(page => page.type === TECHNICAL_DOC_TYPE && page.published).length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: criteria.contextPathNamingConvention,
        evaluate: matchNamingConvention(api => api.proxy.context_path, API_CONTEXT_PATH_REGEX)
    },
    {
        criterion: criteria.endpointsNamingConvention,
        evaluate: function(api) {
            const nonCompliantEndpoints = api.proxy.groups.filter(group =>
                group.endpoints !== undefined &&
                group.endpoints.filter(endpoint => !endpoint.name.startsWith(group.name + " - ")).length > 0);
            return nonCompliantEndpoints == null || nonCompliantEndpoints.length == 0;
        }
    },
    {
        criterion: criteria.healthCheckActive,
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
                    describe: "API UUID. If not provided, extract API quality for all APIs",
                    type: 'string'
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
        const apiIds = this.argv['api-id'] !== undefined
            ? Rx.of(this.argv['api-id'])
            : managementApi.login(this.argv['username'], this.argv['password']).pipe(
                  flatMap(_token => managementApi.listApis().pipe(
                      map(api => api.id)
                  ))
              );

        const qualityFunctions = Rx.of(
            this.getGraviteeQuality,
            this.evaluateQualityFromDetail,
            this.validateSupportEmailDefined);
        apiIds.pipe(
            flatMap(apiId => qualityFunctions.pipe(
                flatMap(qualityFunction => qualityFunction.bind(this)(managementApi, apiId)),
                reduce((acc, criteria) => acc.concat(criteria), []),
                map(criteria => criteria.sort((c1, c2) => c1.reference.localeCompare(c2.reference))),
                flatMap(criteria => managementApi.getApi(apiId).pipe(
                    map(api => Object.assign({api: api, criteria: criteria}))
                ))
            )),
            reduce((acc, apiQuality) => acc.concat(apiQuality), [])
        ).subscribe(this.defaultSubscriber(
             apisQuality => {
                 this.displayInfo("CSV content:");
                 this.displayRaw("API id,API name," + Object.values(criteria).reduce((acc, criterion) => acc + criterion.reference + ",", ""));
                 apisQuality.forEach((apiQuality, i) =>
                     this.displayRaw(apiQuality.api.id + "," +
                                     apiQuality.api.name + "," +
                                     Array.from(apiQuality.criteria).reduce((acc, criteria) => acc + criteria.complied + ",", ""))
                 );
             }
         ));
    }

    getGraviteeQuality(managementApi, apiId) {
        return this.graviteeAutomationOverrideEnabled() ? Rx.EMPTY :
            managementApi.login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.getQuality(apiId).pipe(
                    map(quality => convertQualityCriteria(quality))
                ))
            );
    }

    evaluateQualityFromDetail(managementApi, apiId) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.export(apiId).pipe(
                    flatMap(apiDetail => Rx.from(criteriaEvaluators).pipe(
                            filter(evaluator => evaluator.enabled === undefined || evaluator.enabled(this)),
                            map(evaluator => new QualityCriterion(evaluator.criterion.description, evaluator.criterion.reference, evaluator.evaluate(apiDetail))),
                            reduce((acc, criteria) => acc.concat(criteria), [])
                    ))
                ))
            );
    }

    validateSupportEmailDefined(managementApi, apiId) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.getApiMetadata(apiId).pipe(
                    map(metadata => {
                        const complied = metadata.filter(data => data.key === "email-support" && data.value !== undefined && data.value.length > 0).length > 0;
                        const criterion = criteria.supportEmailDefined;
                        return new QualityCriterion(criterion.description, criterion.reference, complied);
                    })
                ))
            );
    }

    graviteeAutomationOverrideEnabled() {
        return this.argv['override-gravitee-automation'];
    }

}
new ExtractApiQuality().run();