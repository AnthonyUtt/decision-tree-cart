'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var Matrix = _interopDefault(require('ml-matrix'));
var meanArray = _interopDefault(require('ml-array-mean'));

/**
 * @private
 * return an array of probabilities of each class
 * @param {Array} array - contains the classes
 * @param {number} numberOfClasses
 * @return {Matrix} - rowVector of probabilities.
 */
function toDiscreteDistribution(array, numberOfClasses) {
  let counts = new Array(numberOfClasses).fill(0);
  for (let i = 0; i < array.length; ++i) {
    counts[array[i]] += 1 / array.length;
  }

  return Matrix.rowVector(counts);
}

/**
 * @private
 * Retrieves the impurity of array of predictions
 * @param {Array} array - predictions.
 * @return {number} Gini impurity
 */
function giniImpurity(array) {
  if (array.length === 0) {
    return 0;
  }

  let probabilities = toDiscreteDistribution(
    array,
    getNumberOfClasses(array),
  ).getRow(0);

  let sum = 0.0;
  for (let i = 0; i < probabilities.length; ++i) {
    sum += probabilities[i] * probabilities[i];
  }

  return 1 - sum;
}

/**
 * @private
 * Return the number of classes given the array of predictions.
 * @param {Array} array - predictions.
 * @return {number} Number of classes.
 */
function getNumberOfClasses(array) {
  return array
    .filter(function(val, i, arr) {
      return arr.indexOf(val) === i;
    })
    .map((val) => val + 1)
    .reduce((a, b) => Math.max(a, b));
}

/**
 * @private
 * Calculates the Gini Gain of an array of predictions and those predictions splitted by a feature.
 * @param {Array} array - Predictions
 * @param {object} splitted - Object with elements "greater" and "lesser" that contains an array of predictions splitted.
 * @return {number} - Gini Gain.
 */

function giniGain(array, splitted) {
  let splitsImpurity = 0.0;
  let splits = ['greater', 'lesser'];

  for (let i = 0; i < splits.length; ++i) {
    let currentSplit = splitted[splits[i]];
    splitsImpurity +=
      (giniImpurity(currentSplit) * currentSplit.length) / array.length;
  }

  return giniImpurity(array) - splitsImpurity;
}

/**
 * @private
 * Calculates the squared error of a predictions values.
 * @param {Array} array - predictions values
 * @return {number} squared error.
 */
function squaredError(array) {
  let l = array.length;

  let m = meanArray(array);
  let error = 0.0;

  for (let i = 0; i < l; ++i) {
    let currentElement = array[i];
    error += (currentElement - m) * (currentElement - m);
  }

  return error;
}

/**
 * @private
 * Calculates the sum of squared error of the two arrays that contains the splitted values.
 * @param {Array} array - this argument is no necessary but is used to fit with the main interface.
 * @param {object} splitted - Object with elements "greater" and "lesser" that contains an array of predictions splitted.
 * @return {number} - sum of squared errors.
 */
function regressionError(array, splitted) {
  let error = 0.0;
  let splits = ['greater', 'lesser'];

  for (let i = 0; i < splits.length; ++i) {
    let currentSplit = splitted[splits[i]];
    error += squaredError(currentSplit);
  }
  return error;
}

/**
 * @private
 * Split the training set and values from a given column of the training set if is less than a value
 * @param {Matrix} X - Training set.
 * @param {Array} y - Training values.
 * @param {number} column - Column to split.
 * @param {number} value - value to split the Training set and values.
 * @return {object} - Object that contains the splitted values.
 */
function matrixSplitter(X, y, column, value) {
  let lesserX = [];
  let greaterX = [];
  let lesserY = [];
  let greaterY = [];

  for (let i = 0; i < X.rows; ++i) {
    if (X.get(i, column) < value) {
      lesserX.push(X.getRow(i));
      lesserY.push(y[i]);
    } else {
      greaterX.push(X.getRow(i));
      greaterY.push(y[i]);
    }
  }

  return {
    greaterX: greaterX,
    greaterY: greaterY,
    lesserX: lesserX,
    lesserY: lesserY,
  };
}

/**
 * @private
 * Calculates the mean between two values
 * @param {number} a
 * @param {number} b
 * @return {number}
 */
function mean(a, b) {
  return (a + b) / 2;
}

/**
 * @private
 * Returns a list of tuples that contains the i-th element of each array.
 * @param {Array} a
 * @param {Array} b
 * @return {Array} list of tuples.
 */
function zip(a, b) {
  if (a.length !== b.length) {
    throw new TypeError(
      `Error on zip: the size of a: ${a.length} is different from b: ${b.length}`,
    );
  }

  let ret = new Array(a.length);
  for (let i = 0; i < a.length; ++i) {
    ret[i] = [a[i], b[i]];
  }

  return ret;
}

const gainFunctions = {
  gini: giniGain,
  regression: regressionError,
};

const splitFunctions = {
  mean: mean,
};

class TreeNode {
  /**
   * @private
   * Constructor for a tree node given the options received on the main classes (DecisionTreeClassifier, DecisionTreeRegression)
   * @param {object|TreeNode} options for loading
   * @constructor
   */
  constructor(options) {
    // options parameters
    this.kind = options.kind;
    this.gainFunction = options.gainFunction;
    this.splitFunction = options.splitFunction;
    this.minNumSamples = options.minNumSamples;
    this.maxDepth = options.maxDepth;
  }

  /**
   * @private
   * Function that retrieve the best feature to make the split.
   * @param {Matrix} XTranspose - Training set transposed
   * @param {Array} y - labels or values (depending of the decision tree)
   * @return {object} - return tree values, the best gain, column and the split value.
   */
  bestSplit(XTranspose, y) {
    // Depending in the node tree class, we set the variables to check information gain (to classify)
    // or error (for regression)

    let bestGain = this.kind === 'classifier' ? -Infinity : Infinity;
    let check = this.kind === 'classifier' ? (a, b) => a > b : (a, b) => a < b;

    let maxColumn;
    let maxValue;

    for (let i = 0; i < XTranspose.rows; ++i) {
      let currentFeature = XTranspose.getRow(i);
      let splitValues = this.featureSplit(currentFeature, y);
      for (let j = 0; j < splitValues.length; ++j) {
        let currentSplitVal = splitValues[j];
        let min_currentFeature = Math.min(...currentFeature);
        let splitted = this.split(currentFeature, y, currentSplitVal);

        let gain = Infinity;
        if (min_currentFeature === currentSplitVal) {
          gain = gainFunctions[this.gainFunction](y, splitted);
        }
        
        if (check(gain, bestGain)) {
          maxColumn = i;
          maxValue = currentSplitVal;
          bestGain = gain;
        }
      }
    }

    return {
      maxGain: bestGain,
      maxColumn: maxColumn,
      maxValue: maxValue,
    };
  }

  /**
   * @private
   * Makes the split of the training labels or values from the training set feature given a split value.
   * @param {Array} x - Training set feature
   * @param {Array} y - Training set value or label
   * @param {number} splitValue
   * @return {object}
   */
  split(x, y, splitValue) {
    let lesser = [];
    let greater = [];

    for (let i = 0; i < x.length; ++i) {
      if (x[i] < splitValue) {
        lesser.push(y[i]);
      } else {
        greater.push(y[i]);
      }
    }

    return {
      greater: greater,
      lesser: lesser,
    };
  }

  /**
   * @private
   * Calculates the possible points to split over the tree given a training set feature and corresponding labels or values.
   * @param {Array} x - Training set feature
   * @param {Array} y - Training set value or label
   * @return {Array} possible split values.
   */
  featureSplit(x, y) {
    let splitValues = [];
    let arr = zip(x, y);
    arr.sort(function(a, b) {
      return a[0] - b[0];
    });

    for (let i = 1; i < arr.length; ++i) {
      if (arr[i - 1][1] !== arr[i][1]) {
        splitValues.push(
          splitFunctions[this.splitFunction](arr[i - 1][0], arr[i][0]),
        );
      }
    }

    return splitValues;
  }

  /**
   * @private
   * Calculate the predictions of a leaf tree node given the training labels or values
   * @param {Array} y
   */
  calculatePrediction(y) {
    if (this.kind === 'classifier') {
      this.distribution = toDiscreteDistribution(
        y,
        getNumberOfClasses(y),
      );
      if (this.distribution.columns === 0) {
        throw new TypeError('Error on calculate the prediction');
      }
    } else {
      this.distribution = meanArray(y);
    }
  }

  /**
   * @private
   * Train a node given the training set and labels, because it trains recursively, it also receive
   * the current depth of the node, parent gain to avoid infinite recursion and boolean value to check if
   * the training set is transposed.
   * @param {Matrix} X - Training set (could be transposed or not given transposed).
   * @param {Array} y - Training labels or values.
   * @param {number} currentDepth - Current depth of the node.
   * @param {number} parentGain - parent node gain or error.
   */
  train(X, y, currentDepth, parentGain) {
    if (X.rows <= this.minNumSamples) {
      this.calculatePrediction(y);
      return;
    }
    if (parentGain === undefined) parentGain = 0.0;

    let XTranspose = X.transpose();
    let split = this.bestSplit(XTranspose, y);

    this.splitValue = split.maxValue;
    this.splitColumn = split.maxColumn;
    this.gain = split.maxGain;

    let splittedMatrix = matrixSplitter(
      X,
      y,
      this.splitColumn,
      this.splitValue,
    );

    if (
      currentDepth < this.maxDepth &&
      (this.gain > 0.01 && this.gain !== parentGain) &&
      (splittedMatrix.lesserX.length > 0 && splittedMatrix.greaterX.length > 0)
    ) {
      this.left = new TreeNode(this);
      this.right = new TreeNode(this);

      let lesserX = new Matrix(splittedMatrix.lesserX);
      let greaterX = new Matrix(splittedMatrix.greaterX);

      this.left.train(
        lesserX,
        splittedMatrix.lesserY,
        currentDepth + 1,
        this.gain,
      );
      this.right.train(
        greaterX,
        splittedMatrix.greaterY,
        currentDepth + 1,
        this.gain,
      );
    } else {
      this.calculatePrediction(y);
    }
  }

  /**
   * @private
   * Calculates the prediction of a given element.
   * @param {Array} row
   * @return {number|Array} prediction
   *          * if a node is a classifier returns an array of probabilities of each class.
   *          * if a node is for regression returns a number with the prediction.
   */
  classify(row) {
    if (this.right && this.left) {
      if (row[this.splitColumn] < this.splitValue) {
        return this.left.classify(row);
      } else {
        return this.right.classify(row);
      }
    }

    return this.distribution;
  }

  /**
   * @private
   * Set the parameter of the current node and their children.
   * @param {object} node - parameters of the current node and the children.
   */
  setNodeParameters(node) {
    if (node.distribution !== undefined) {
      this.distribution =
        node.distribution.constructor === Array
          ? new Matrix(node.distribution)
          : node.distribution;
    } else {
      this.distribution = undefined;
      this.splitValue = node.splitValue;
      this.splitColumn = node.splitColumn;
      this.gain = node.gain;

      this.left = new TreeNode(this);
      this.right = new TreeNode(this);

      if (node.left !== {}) {
        this.left.setNodeParameters(node.left);
      }
      if (node.right !== {}) {
        this.right.setNodeParameters(node.right);
      }
    }
  }
}

const defaultOptions = {
  gainFunction: 'gini',
  splitFunction: 'mean',
  minNumSamples: 3,
  maxDepth: Infinity,
};

class DecisionTreeClassifier {
  /**
   * Create new Decision Tree Classifier with CART implementation with the given options
   * @param {object} options
   * @param {string} [options.gainFunction="gini"] - gain function to get the best split, "gini" the only one supported.
   * @param {string} [options.splitFunction="mean"] - given two integers from a split feature, get the value to split, "mean" the only one supported.
   * @param {number} [options.minNumSamples=3] - minimum number of samples to create a leaf node to decide a class.
   * @param {number} [options.maxDepth=Infinity] - Max depth of the tree.
   * @param {object} model - for load purposes.
   * @constructor
   */
  constructor(options, model) {
    if (options === true) {
      this.options = model.options;
      this.root = new TreeNode(model.options);
      this.root.setNodeParameters(model.root);
    } else {
      this.options = Object.assign({}, defaultOptions, options);
      this.options.kind = 'classifier';
    }
  }

  /**
   * Train the decision tree with the given training set and labels.
   * @param {Matrix|MatrixTransposeView|Array} trainingSet
   * @param {Array} trainingLabels
   */
  train(trainingSet, trainingLabels) {
    this.root = new TreeNode(this.options);
    trainingSet = Matrix.checkMatrix(trainingSet);
    this.root.train(trainingSet, trainingLabels, 0, null);
  }

  /**
   * Predicts the output given the matrix to predict.
   * @param {Matrix|MatrixTransposeView|Array} toPredict
   * @return {Array} predictions
   */
  predict(toPredict) {
    toPredict = Matrix.checkMatrix(toPredict);
    let predictions = new Array(toPredict.rows);

    for (let i = 0; i < toPredict.rows; ++i) {
      predictions[i] = this.root
        .classify(toPredict.getRow(i))
        .maxRowIndex(0)[1];
    }

    return predictions;
  }

  /**
   * Export the current model to JSON.
   * @return {object} - Current model.
   */
  toJSON() {
    return {
      options: this.options,
      root: this.root,
      name: 'DTClassifier',
    };
  }

  /**
   * Load a Decision tree classifier with the given model.
   * @param {object} model
   * @return {DecisionTreeClassifier}
   */
  static load(model) {
    if (model.name !== 'DTClassifier') {
      throw new RangeError(`Invalid model: ${model.name}`);
    }

    return new DecisionTreeClassifier(true, model);
  }
}

const defaultOptions$1 = {
  gainFunction: 'regression',
  splitFunction: 'mean',
  minNumSamples: 3,
  maxDepth: Infinity,
};

class DecisionTreeRegression {
  /**
   * Create new Decision Tree Regression with CART implementation with the given options.
   * @param {object} options
   * @param {string} [options.gainFunction="regression"] - gain function to get the best split, "regression" the only one supported.
   * @param {string} [options.splitFunction="mean"] - given two integers from a split feature, get the value to split, "mean" the only one supported.
   * @param {number} [options.minNumSamples=3] - minimum number of samples to create a leaf node to decide a class.
   * @param {number} [options.maxDepth=Infinity] - Max depth of the tree.
   * @param {object} model - for load purposes.
   */
  constructor(options, model) {
    if (options === true) {
      this.options = model.options;
      this.root = new TreeNode(model.options);
      this.root.setNodeParameters(model.root);
    } else {
      this.options = Object.assign({}, defaultOptions$1, options);
      this.options.kind = 'regression';
    }
  }

  /**
   * Train the decision tree with the given training set and values.
   * @param {Matrix|MatrixTransposeView|Array} trainingSet
   * @param {Array} trainingValues
   */
  train(trainingSet, trainingValues) {
    this.root = new TreeNode(this.options);

    if (
      typeof trainingSet[0] !== 'undefined' &&
      trainingSet[0].length === undefined
    ) {
      trainingSet = Matrix.columnVector(trainingSet);
    } else {
      trainingSet = Matrix.checkMatrix(trainingSet);
    }
    this.root.train(trainingSet, trainingValues, 0);
  }

  /**
   * Predicts the values given the matrix to predict.
   * @param {Matrix|MatrixTransposeView|Array} toPredict
   * @return {Array} predictions
   */
  predict(toPredict) {
    if (
      typeof toPredict[0] !== 'undefined' &&
      toPredict[0].length === undefined
    ) {
      toPredict = Matrix.columnVector(toPredict);
    }
    toPredict = Matrix.checkMatrix(toPredict);

    let predictions = new Array(toPredict.rows);
    for (let i = 0; i < toPredict.rows; ++i) {
      predictions[i] = this.root.classify(toPredict.getRow(i));
    }

    return predictions;
  }

  /**
   * Export the current model to JSON.
   * @return {object} - Current model.
   */
  toJSON() {
    return {
      options: this.options,
      root: this.root,
      name: 'DTRegression',
    };
  }

  /**
   * Load a Decision tree regression with the given model.
   * @param {object} model
   * @return {DecisionTreeRegression}
   */
  static load(model) {
    if (model.name !== 'DTRegression') {
      throw new RangeError(`Invalid model:${model.name}`);
    }

    return new DecisionTreeRegression(true, model);
  }
}

exports.DecisionTreeClassifier = DecisionTreeClassifier;
exports.DecisionTreeRegression = DecisionTreeRegression;
