# yarn global add @vue/cli
# vue create PROJECT_NAME
cd PROJECT_NAME
vue add electron-builder
#sudo apt install apt-file
#apt-file update
#sudo apt-file update
#apt-file search libgtk3
sudo apt install -y \
  libgtk3.0-cil \
  libXss.so.2 \
  libXss.so.1 \
  libxss \
  libxss1 \
  libgconf-2-4 \
  libnss3 \
  libasound2 
yarn electron:serve
