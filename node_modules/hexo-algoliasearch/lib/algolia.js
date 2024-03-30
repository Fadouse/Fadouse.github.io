"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.upperFirst = exports.splitIntoChunks = exports.preparePosts = exports.pick = exports.getFieldsWithFilters = exports.getBasicFields = exports.default = void 0;
var _striptags = _interopRequireDefault(require("striptags"));
var _algoliasearch = _interopRequireDefault(require("algoliasearch"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
const FILTER_FUNCTIONS = {
  strip: _striptags.default,
  truncate: function truncate(post, start, end) {
    return post.substr(start, end);
  }
};

/**
 * Pick specified attributes of a given object
 *
 * @param {Object} object - The object to pick the attribute from
 * @param {Array} attributes - The attributes to pick from the given object
 * @returns {Object}
 */
const pick = (object, attributes) => {
  const newObject = {};
  attributes.forEach(attribute => {
    if (object.hasOwnProperty(attribute)) {
      newObject[attribute] = object[attribute];
    }
  });
  return newObject;
};

/**
 * Upper case the first character of a string
 *
 * @param {String} string - The string to update
 * @returns {string}
 */
exports.pick = pick;
const upperFirst = string => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};
/**
 * Split an `Array` into chunk
 *
 * @param {Array} array - The `Array` to split
 * @param {Number} chunkSize - The size of the chunks
 * @returns {Array}
 */
exports.upperFirst = upperFirst;
const splitIntoChunks = (array, chunkSize) => {
  const newArrays = array.slice(0);
  const chunks = [];
  while (newArrays.length) {
    chunks.push(newArrays.splice(0, chunkSize));
  }
  return chunks;
};

/**
 * Pick speficied fields of posts
 *
 * @param {Object} posts - The posts to prepare
 * @param {Array} fields - The fields of the posts to select
 * @param {Array} fieldsWithFilters - The fields of the posts to select
 * @returns {Object} posts - The posts ready to be indexed
 */
exports.splitIntoChunks = splitIntoChunks;
const preparePosts = (posts, fields, fieldsWithFilters) => {
  const tagsAndCategoriesFields = ['tags', 'categories'].filter(field => fields.includes(field));
  return posts.map(initialPost => {
    const postToIndex = pick(initialPost, fields);
    // define a unique ID to identfy this post on Algolia
    postToIndex.objectID = initialPost._id;

    // extract tags and categories
    tagsAndCategoriesFields.forEach(field => {
      postToIndex[field] = [];
      initialPost[field].data.forEach(function (fieldElement) {
        postToIndex[field].push(fieldElement.name);
      });
    });

    // execute filters of fields
    fieldsWithFilters.forEach(field => {
      const indexedFieldName = [];
      const fieldFilters = field.split(':');
      const fieldName = fieldFilters.shift();
      if (!initialPost.hasOwnProperty(fieldName)) {
        hexo.log.warn(`"${initialPost.title}" post has no "${fieldName}" field.`);
        return;
      }
      let fieldValue = initialPost[fieldName];
      fieldFilters.forEach(function (filter) {
        const filterArgs = filter.split(',');
        const filterName = filterArgs.shift();
        indexedFieldName.push(upperFirst(filterName));
        filterArgs.unshift(fieldValue);
        // execute filter on field value
        fieldValue = FILTER_FUNCTIONS[filterName].apply(this, filterArgs);
      });

      // store filter result in post object
      postToIndex[fieldName + indexedFieldName.join('')] = fieldValue;
    });
    return postToIndex;
  });
};

/**
 * Get fields without filters
 *
 * @param {Array} fields - A list of fields. E.g: content, excerpt, categories, etc...
 * @returns {Array} - A list of fields without any filters
 */
exports.preparePosts = preparePosts;
const getBasicFields = fields => fields.filter(field => !/:/.test(field));

/**
 * Get fields with filters
 *
 * @param {Array} fields - A list of fields. E.g: content, excerpt, categories, etc...
 * @returns {Array} - A list of fields with filters
 */
exports.getBasicFields = getBasicFields;
const getFieldsWithFilters = fields => fields.filter(field => /:/.test(field));
exports.getFieldsWithFilters = getFieldsWithFilters;
const algoliaCommand = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(function* (hexo, args, callback) {
    const algoliaConfig = hexo.config.algolia;
    const fields = getBasicFields(algoliaConfig.fields);
    const fieldsWithFilters = getFieldsWithFilters(algoliaConfig.fields);
    const algoliaAppId = process.env.ALGOLIA_APP_ID || algoliaConfig.appId;
    const algoliaAdminApiKey = process.env.ALGOLIA_ADMIN_API_KEY || algoliaConfig.adminApiKey;
    const algoliaIndexName = process.env.ALGOLIA_INDEX_NAME || algoliaConfig.indexName;
    // Algolia recommendation: split posts into chunks of 5000 to get a good indexing/insert performance
    const algoliaChunkSize = algoliaConfig.chunkSize || 5000;
    yield hexo.call('generate');
    yield hexo.database.load();
    let posts = hexo.database.model('Post').find({
      published: true
    }).sort('date', 'asc').toArray();
    if (!posts.length) {
      hexo.log.info('There is no post to index.');
      return callback();
    }
    posts = preparePosts(posts, fields, fieldsWithFilters);
    const chunkedPosts = splitIntoChunks(posts, algoliaChunkSize);
    const algoliaClient = (0, _algoliasearch.default)(algoliaAppId, algoliaAdminApiKey);
    const algoliaIndex = algoliaClient.initIndex(algoliaIndexName);
    if (args && !args.n) {
      hexo.log.info('Clearing index on Algolia...');
      try {
        yield algoliaIndex.clearObjects();
      } catch (error) {
        hexo.log.info(`Error has occurred during clearing index : ${error}`);
        return callback(error);
      }
      hexo.log.info('Index cleared.');
    }
    hexo.log.info('Indexing posts on Algolia...');
    try {
      yield Promise.all(chunkedPosts.map(posts => algoliaIndex.saveObjects(posts)));
    } catch (error) {
      hexo.log.info(`Error has occurred during indexing posts : ${error}`);
      return callback(error);
    }
    hexo.log.info(`${posts.length} posts indexed.`);
  });
  return function algoliaCommand(_x, _x2, _x3) {
    return _ref.apply(this, arguments);
  };
}();
var _default = exports.default = algoliaCommand;