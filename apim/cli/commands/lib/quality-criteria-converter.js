const util = require("util");

const criteriaMapping = {
    "api.quality.metrics.description.weight": {name: "Description with minimal length defined", reference: "DF03"},
    "api.quality.metrics.labels.weight": {name: "Labels defined", reference: "DF05"},
    "api.quality.metrics.logo.weight": {name: "Logo defined", reference: "DF07"},
    "api.quality.metrics.views.weight": {name: "Views defined", reference: "DF08"},
    "api.quality.metrics.functional.documentation.weight": {name: "Functional documentation defined", reference: "DF11"},
    "api.quality.metrics.technical.documentation.weight": {name: "Technical documentation defined", reference: "DF14"},
    "api.quality.metrics.healthcheck.weight": {name: "Health-check activated", reference: "DF20"},
    "application.quality.metrics.name.weight": {name: "Name that follows naming convention", reference: "APP-DF01"},
    "application.quality.metrics.description.weight": {name: "Description with minimal length defined", reference: "APP-DF02"},
};

/**
 * Convert quality criteria from Gravitee format to quality assessment format, with name and reference.
 *
 * @param {object} quality Gravitee quality structure as defined at https://docs.gravitee.io/apim/api/1.25/#operation/getQualityMetrics
 */
function convertQualityCriteria(quality) {
    return Object.entries(quality.metrics_passed)
        .map(([criteriaKey, complied]) => new QualityCriterion(criteriaMapping[criteriaKey].name, criteriaMapping[criteriaKey].reference, complied));
}

/**
 * Quality criterion containing name, reference and compliance flag.
 */
QualityCriterion = class {
    constructor(name, reference, complied) {
        this.name = name;
        this.reference = reference;
        this.complied = complied;
    }
};

module.exports = {
    convertQualityCriteria,
    QualityCriterion
};
