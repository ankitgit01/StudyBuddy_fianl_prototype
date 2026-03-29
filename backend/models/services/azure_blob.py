from azure.storage.blob import BlobClient
from config import STORAGE_CONNECTION_STRING, AZURE_BLOB_CONTAINER


def upload_image(file):

    if not STORAGE_CONNECTION_STRING:
        raise Exception("Storage connection string missing")

    blob_client = BlobClient.from_connection_string(
        STORAGE_CONNECTION_STRING,
        container_name=AZURE_BLOB_CONTAINER,
        blob_name=file.filename
    )

    blob_client.upload_blob(file.file, overwrite=True)

    return blob_client.url

def upload_image_bytes(image_bytes: bytes, filename: str) -> str:
    """
    Upload raw bytes to Azure Blob.
    Used by Mayank's ML models to upload heatmap images.
    """
    if not STORAGE_CONNECTION_STRING:
        raise Exception("Storage connection string missing")
    blob_client = BlobClient.from_connection_string(
        STORAGE_CONNECTION_STRING,
        container_name=AZURE_BLOB_CONTAINER,
        blob_name=filename,
    )
    blob_client.upload_blob(image_bytes, overwrite=True)
    return blob_client.url