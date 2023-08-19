import React from 'react'
import {useMutation} from "@tanstack/react-query"
import {uploadPhoto} from "../api/photo"
export const Uploader = () => {
    const mutation = useMutation(uploadPhoto, {
        onSuccess (response){
            response.json().then((data) => console.log(data))
        }
        
    })
    const uploadFile = (e ) => {
        const files = e.target.files;
        const formData = new FormData()
        Object.values(files).forEach((file) => 
            formData.append("file", file)
        );
        mutation.mutate(formData)
    };


    return (

        <form>
            <p> Upload Files</p>
            <input
                type="file"
               
                multiple
                onChange={uploadFile} />

        </form>
    )
        
    }