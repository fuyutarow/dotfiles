jupyter notebook --generate-config
echo """
c.IPKernelApp.pylab = 'inline'
c.NotebookApp.ip = '0.0.0.0'
c.NotebookApp.open_browser = False
c.NotebookApp.port = 8888
# c.NotebookApp.kernel_spec_manager_class = 'environment_kernels.EnvironmentKernelSpecManager'
c.EnvironmentKernelSpecManager.conda_env_dirs = ['/anaconda_path/envs']
""" >> ~/.jupyter/jupyter_notebook_config.py
jupyter notebook password
