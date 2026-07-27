from setuptools import setup, find_packages

setup(
    name="shared-common",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "pydantic>=2.0",
        "redis>=4.6.0",
        "pymongo>=4.4.0",
        "pymysql>=1.1.0",
        "sqlalchemy>=2.0",
        "pandas>=2.0.0",
        "numpy>=1.24.0",
        "joblib>=1.3.0",
        "scikit-learn>=1.3.0"
    ]
)
