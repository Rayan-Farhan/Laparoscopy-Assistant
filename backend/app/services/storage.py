from __future__ import annotations

from io import BufferedReader, BytesIO
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from app.core.config import Settings, get_settings


class StorageService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = None
        if settings.storage_mode == "s3":
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint_url,
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
                region_name=settings.s3_region,
                use_ssl=settings.s3_use_ssl,
            )

    @property
    def bucket(self) -> str:
        return self.settings.s3_bucket

    @property
    def local_root(self) -> Path:
        return Path(self.settings.local_storage_path).resolve()

    def ensure_bucket(self) -> None:
        if self.settings.storage_mode == "local":
            self.local_root.mkdir(parents=True, exist_ok=True)
            return
        assert self._client is not None
        try:
            self._client.head_bucket(Bucket=self.bucket)
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            if error_code not in {"404", "NoSuchBucket"}:
                raise RuntimeError(f"Unable to access bucket '{self.bucket}': {exc}") from exc
            self._client.create_bucket(Bucket=self.bucket)

    def _local_path(self, storage_key: str) -> Path:
        safe_key = storage_key.replace("..", "").lstrip("/\\")
        return self.local_root.joinpath(*Path(safe_key).parts)

    def upload_bytes(self, *, storage_key: str, content: bytes, content_type: str) -> None:
        self.ensure_bucket()
        if self.settings.storage_mode == "local":
            path = self._local_path(storage_key)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            return
        assert self._client is not None
        self._client.put_object(
            Bucket=self.bucket,
            Key=storage_key,
            Body=content,
            ContentType=content_type,
        )

    def upload_fileobj(self, *, storage_key: str, file_obj: BytesIO | BufferedReader, content_type: str) -> None:
        self.ensure_bucket()
        if self.settings.storage_mode == "local":
            path = self._local_path(storage_key)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("wb") as output:
                output.write(file_obj.read())
            return
        assert self._client is not None
        self._client.upload_fileobj(
            Fileobj=file_obj,
            Bucket=self.bucket,
            Key=storage_key,
            ExtraArgs={"ContentType": content_type},
        )

    def download_bytes(self, storage_key: str) -> bytes:
        self.ensure_bucket()
        if self.settings.storage_mode == "local":
            path = self._local_path(storage_key)
            if not path.exists():
                raise RuntimeError(f"Object not found for key '{storage_key}'.")
            return path.read_bytes()
        assert self._client is not None
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=storage_key)
        except ClientError as exc:
            raise RuntimeError(f"Unable to download object '{storage_key}': {exc}") from exc
        return response["Body"].read()

    def object_exists(self, storage_key: str) -> bool:
        self.ensure_bucket()
        if self.settings.storage_mode == "local":
            return self._local_path(storage_key).exists()
        assert self._client is not None
        try:
            self._client.head_object(Bucket=self.bucket, Key=storage_key)
            return True
        except ClientError:
            return False

    def object_size(self, storage_key: str) -> int:
        self.ensure_bucket()
        if self.settings.storage_mode == "local":
            path = self._local_path(storage_key)
            if not path.exists():
                raise RuntimeError(f"Object not found for key '{storage_key}'.")
            return path.stat().st_size
        assert self._client is not None
        response = self._client.head_object(Bucket=self.bucket, Key=storage_key)
        return int(response.get("ContentLength", 0))

    def generate_upload_url(self, *, storage_key: str, content_type: str, expires_seconds: int = 900) -> str:
        self.ensure_bucket()
        if self.settings.storage_mode == "local":
            return f"local://{storage_key}"
        assert self._client is not None
        return self._client.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": self.bucket, "Key": storage_key, "ContentType": content_type},
            ExpiresIn=expires_seconds,
        )

    def generate_download_url(self, *, storage_key: str, expires_seconds: int = 900) -> str:
        self.ensure_bucket()
        if self.settings.storage_mode == "local":
            return f"local://{storage_key}"
        assert self._client is not None
        return self._client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": self.bucket, "Key": storage_key},
            ExpiresIn=expires_seconds,
        )


_storage_service: StorageService | None = None


def get_storage_service() -> StorageService:
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService(get_settings())
    return _storage_service

