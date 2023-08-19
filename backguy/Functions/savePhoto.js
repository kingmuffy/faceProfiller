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
  console.log('Parsed data:', parsed); // For debugging

  const file = parsed.files[0];
  const comment = parsed.comment;
  const posterName = parsed.posterName; // Extracting the poster's name

  const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const key = `${uuidv4()}`; // Unique key using only UUID

  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file.content,
  }).promise();

  const imageUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;

  const dbParams = {
    TableName: PHOTOS_TABLE,
    Item: {
      ExternalImageId: key, // Storing key as ExternalImageId
      imageUrl: imageUrl,
      comments: [comment], // Store the comment
      posterName: posterName, // Storing the poster's name
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
      // Assuming the ExternalImageId is the key
      const key = faceMatch.Face.ExternalImageId;
      
      // Fetching the corresponding URL from DynamoDB
      const dbParams = {
        TableName: PHOTOS_TABLE,
        Key: {
          ExternalImageId: key,
        },
      };

      const result = await dynamodb.get(dbParams).promise();
      return result.Item ? result.Item.imageUrl : null; // Returning the URL if found
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


module.exports.getPhotos = async () => {
  const dbParams = {
    TableName: PHOTOS_TABLE,
    limit : 50
  };

  try {
    const result = await dynamodb
    .scan(dbParams)
    .promise();
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("Error fetching photos:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "An error occurred while fetching the photos." }),
    };
  }
};
