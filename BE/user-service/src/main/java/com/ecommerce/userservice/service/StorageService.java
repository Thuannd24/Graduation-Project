package com.ecommerce.userservice.service;

import org.springframework.web.multipart.MultipartFile;

public interface StorageService {
    
    /**
     * Uploads a file to MinIO storage and returns its public URL.
     * 
     * @param file the MultipartFile to upload
     * @param folder the folder/prefix inside the bucket
     * @return the public access URL of the uploaded file
     */
    String uploadFile(MultipartFile file, String folder);
}
