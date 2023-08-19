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