from setuptools import setup, find_packages

setup(
    name="shared-common",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "pydantic>=2.0",
        "redis>=4.6.0",
        "pymongo>=4.4.0",
        "pymysql>=1.1.0"
    ]
)
