'use strict'

const fs = require('fs');
const path = require('path');
const antlr4 = require('antlr4');
const Protobuf3Lexer = require('./parser/Protobuf3Lexer');
const Protobuf3Parser = require('./parser/Protobuf3Parser');
const protoToCollectionsVisitor = require('./protobufToCollectionsVisitor');
const ExprErrorListener = require('./antlrErrorListener');
const { setDependencies, dependencies } = require('./appDependencies');
const { parseDescriptor } = require('./services/descriptorToProtoStringService')
const { convertParsedFileDataToCollections } = require('./services/converterService');
const adaptJsonSchema = require('./helpers/adaptJsonSchema/adaptJsonSchema');

module.exports = {
	reFromFile: async (data, logger, callback, app) => {
		setDependencies(app);
		const _ = dependencies.lodash;
		try {
			let input = await handleFileData(data.filePath);
			const isDescriptor = !_.isError(_.attempt(JSON.parse, input))
			if (isDescriptor) {
				const parsedDescriptor = JSON.parse(input);
				input = parseDescriptor(parsedDescriptor.fileDescriptorSet)
			}
			const chars = new antlr4.InputStream(input);
			const lexer = new Protobuf3Lexer.Protobuf3Lexer(chars);

			const tokens = new antlr4.CommonTokenStream(lexer);
			const parser = new Protobuf3Parser.Protobuf3Parser(tokens);
			parser.removeErrorListeners();
			parser.addErrorListener(new ExprErrorListener());
			const fileDefinitions = parser.proto().accept(new protoToCollectionsVisitor());
			if(_.isEmpty(fileDefinitions.messages)){
				const errorObject = {
					message: `No message was found in the file`,
					stack: {},
				};
				logger.log('error', errorObject, 'ProtoBuf file Reverse-Engineering Error');
				callback(errorObject);
			}
			const result = convertParsedFileDataToCollections(fileDefinitions, path.basename(data.filePath));
			callback(null, result, { dbVersion: fileDefinitions.syntaxVersion }, [], 'multipleSchema');

		} catch (e) {
			const errorObject = {
				message: _.get(e, 'message', ''),
				stack: e.stack,
			};

			logger.log('error', errorObject, 'ProtoBuf file Reverse-Engineering Error');
			callback(errorObject);
		}
	},

	adaptJsonSchema(data, logger, callback, app) {
		setDependencies(app);
		logger.log('info', 'Adaptation of JSON Schema started...', 'Adapt JSON Schema');
		try {
			const jsonSchema = JSON.parse(data.jsonSchema);

			const adaptedJsonSchema = adaptJsonSchema(jsonSchema);

			logger.log('info', 'Adaptation of JSON Schema finished.', 'Adapt JSON Schema');

			callback(null, {
				jsonSchema: JSON.stringify(adaptedJsonSchema)
			});
		} catch(e) {
			const errorObject = {
				message: `${error.message}\nFile name: ${fileName}`,
				stack: error.stack,
			};
			logger.log('error', errorObject, 'Adaptation of JSON Schema Error');
			callback(errorObject);
		}
	},
};

const handleFileData = filePath => {
	return new Promise((resolve, reject) => {

		fs.readFile(filePath, 'utf-8', (err, content) => {
			if (err) {
				reject(err);
			} else {
				resolve(content);
			}
		});
	});
}
