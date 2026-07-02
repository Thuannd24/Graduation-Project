package com.ecommerce.userservice.service.impl;

import com.ecommerce.userservice.service.StorageService;
import io.minio.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class MinioStorageServiceImpl implements StorageService {

    private final MinioClient minioClient;

    @Value("${minio.bucket-name}")
    private String bucketName;

    @Value("${minio.endpoint}")
    private String endpoint;

    @Override
    public String uploadFile(MultipartFile file, String folder) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Tệp tin tải lên không được trống.");
        }

        // Validate MIME type (Chỉ cho phép định dạng ảnh hợp lệ)
        String contentType = file.getContentType();
        if (contentType == null || !(contentType.equalsIgnoreCase("image/jpeg")
                || contentType.equalsIgnoreCase("image/png")
                || contentType.equalsIgnoreCase("image/gif")
                || contentType.equalsIgnoreCase("image/webp"))) {
            throw new IllegalArgumentException("Định dạng tệp không hợp lệ. Chỉ chấp nhận các định dạng ảnh: JPEG, PNG, GIF, WEBP.");
        }

        try {
            // 1. Tạo bucket nếu chưa có và set policy public read
            prepareBucket();

            // 2. Tạo tên file độc nhất tránh trùng lặp
            String originalFilename = file.getOriginalFilename();
            String extension = "";
            if (originalFilename != null && originalFilename.contains(".")) {
                extension = originalFilename.substring(originalFilename.lastIndexOf("."));
            }
            String objectName = folder + "/" + UUID.randomUUID().toString() + extension;

            // 3. Đẩy file lên MinIO
            try (InputStream is = file.getInputStream()) {
                minioClient.putObject(
                        PutObjectArgs.builder()
                                .bucket(bucketName)
                                .object(objectName)
                                .stream(is, file.getSize(), -1)
                                .contentType(file.getContentType())
                                .build()
                );
            }

            log.info("File uploaded successfully to MinIO: {}", objectName);

            // 4. Trả về public URL truy cập ảnh
            // Nếu endpoint kết thúc bằng 9000, ta trả về URL tương ứng.
            // Ví dụ: http://10.1.24.159:9000/user-avatars/avatars/uuid.png
            return endpoint + "/" + bucketName + "/" + objectName;

        } catch (Exception e) {
            log.error("Failed to upload file to MinIO", e);
            throw new RuntimeException("Không thể tải ảnh lên hệ thống lưu trữ.", e);
        }
    }

    private void prepareBucket() throws Exception {
        boolean exists = minioClient.bucketExists(
                BucketExistsArgs.builder().bucket(bucketName).build()
        );
        if (!exists) {
            log.info("Creating MinIO bucket: {}", bucketName);
            minioClient.makeBucket(
                    MakeBucketArgs.builder().bucket(bucketName).build()
            );

            // Cấu hình Policy cho phép Anonymous Read (Public Read) để trình duyệt hiển thị avatar
            String policy = "{\n" +
                    "  \"Version\": \"2012-10-17\",\n" +
                    "  \"Statement\": [\n" +
                    "    {\n" +
                    "      \"Effect\": \"Allow\",\n" +
                    "      \"Principal\": {\"AWS\": [\"*\"]},\n" +
                    "      \"Action\": [\"s3:GetObject\"],\n" +
                    "      \"Resource\": [\"arn:aws:s3:::" + bucketName + "/*\"]\n" +
                    "    }\n" +
                    "  ]\n" +
                    "}\n";

            minioClient.setBucketPolicy(
                    SetBucketPolicyArgs.builder()
                            .bucket(bucketName)
                            .config(policy)
                            .build()
            );
            log.info("Public read policy applied to bucket: {}", bucketName);
        }
    }
}
