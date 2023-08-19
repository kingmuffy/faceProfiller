const API_URL = 'http://localhost:3009';


export const uploadPhoto = (body) => 
  fetch(API_URL, {
    method: 'POST',
    body,
  });