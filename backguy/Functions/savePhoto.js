const AWS = require("aws-sdk");
const parser = require("lambda-multipart-parser");
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const BUCKET_NAME = process.env.BUCKET_NAME;
const COLLECTION_ID = "my-collection-id";
const PHOTOS_TABLE = process.env.PHOTOS_TABLE;

module.exports.indexFaces = async (event) => {
  const parsed = await parser.parse(event);
  console.log('Parsed data:', parsed);

  const file = parsed.files[0];
  const comment = parsed.comment;
  const posterName = parsed.posterName;
  const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const extension = file.filename.split('.').pop();
  const key = `${sanitizedFilename}-${uuidv4()}.${extension}`; // Key with sanitized filename, UUID, and extension

  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file.content,
  }).promise();

  const imageUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;

  const dbParams = {
    TableName: PHOTOS_TABLE,
    Item: {
      ExternalImageId: key,
      imageUrl: imageUrl,
      comments: [comment],
      posterName: posterName,
    },
  };

  await dynamodb.put(dbParams).promise();

  const params = {
    CollectionId: COLLECTION_ID,
    Image: {
      S3Object: {
        Bucket: BUCKET_NAME,
        Name: key,
      },
    },
    ExternalImageId: key,
  };

  const result = await rekognition.indexFaces(params).promise();
  return {
    statusCode: 200,
    body: JSON.stringify({ ...result, imageUrl }),
  };
};

module.exports.recognizeFaces = async (event) => {
  try {
    const { files } = await parser.parse(event);
    const file = files[0];

    const params = {
      CollectionId: COLLECTION_ID,
      Image: {
        Bytes: file.content,
      },
      MaxFaces: 5,
      FaceMatchThreshold: 70,
    };

    const faces = await rekognition.searchFacesByImage(params).promise();
    const matchingImageUrls = await Promise.all(faces.FaceMatches.map(async faceMatch => {
      const key = faceMatch.Face.ExternalImageId;
      const dbParams = {
        TableName: PHOTOS_TABLE,
        Key: {
          ExternalImageId: key,
        },
      };

      const result = await dynamodb.get(dbParams).promise();
      return result.Item ? result.Item.imageUrl : null;
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ ...faces, matchingImageUrls }),
    };
  } catch (error) {
    console.error("Error processing image:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "An error occurred while processing the image." }),
    };
  }
};
