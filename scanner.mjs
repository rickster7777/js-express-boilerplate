import scanner from 'sonarqube-scanner';

scanner(
    {
        /* The configuration for the sonarqube-scanner module. */
        serverUrl: 'https://sonar.techchefz.com',
        token: '636114bb69d0cd9e0a09c756243a92e9417eab8a',
        /* Setting the project name and the source directory. */
        options: {
            'sonar.projectName': process.env.npm_package_name,
            'sonar.sources': '.',
        },
    },
    /* A function that is called after the sonarqube-scanner module is done. */
    () => process.exit()
);
