import os
import json
import time
import hashlib
import requests

# ==================== 配置区 ====================
HOMEWORK_FILE_PATH = "data/homework.json"
HASH_FILE_PATH = "last_push_hash.txt"
STUDENTS_FILE_PATH = "students.json"
# ================================================

APPID = os.environ.get("WX_APPID")
SECRET = os.environ.get("WX_SECRET")
TEMPLATE_ID = os.environ.get("WX_TEMPLATE_ID")

def get_file_hash(filepath):
    """计算文件的 MD5 哈希值"""
    with open(filepath, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

def fetch_homework():
    """读取本地 JSON 文件"""
    print(f"正在读取本地文件: {HOMEWORK_FILE_PATH}")
    try:
        with open(HOMEWORK_FILE_PATH, "r", encoding="utf-8") as f:
            homework_data = json.load(f)
        
        title = homework_data.get("title", "今日作业")
        
        # 拼接各科作业内容
        content_parts = []
        subjects = ["语文", "数学", "英语", "科学", "社会", "笔记"]
        
        for subject in subjects:
            if subject in homework_data and homework_data[subject]:
                subject_content = homework_data[subject].replace("\\n", "\n")
                content_parts.append(f"【{subject}】\n{subject_content}")
        
        full_content = "\n\n".join(content_parts)
        
        # 微信限制约2048字节，保守截取前600个字符
        if len(full_content) > 600:
            full_content = full_content[:600] + "\n\n... (内容过长，完整版请在网页查看)"
            
        return title, full_content
        
    except Exception as e:
        print(f"❌ 读取作业数据失败: {e}")
        return None, None

def main():
    # 1. 检查环境变量
    if not all([APPID, SECRET, TEMPLATE_ID]):
        print("❌ 环境变量缺失。")
        return

    # 2. 计算当前文件的哈希，对比是否修改
    try:
        current_hash = get_file_hash(HOMEWORK_FILE_PATH)
        if os.path.exists(HASH_FILE_PATH):
            with open(HASH_FILE_PATH, "r") as f:
                last_hash = f.read().strip()
            if current_hash == last_hash:
                print("⏸️ 检测到 homework.json 内容未发生实质变化（哈希相同），跳过推送。")
                return
        print(f"🔄 检测到新修改，准备推送。当前哈希: {current_hash}")
    except Exception as e:
        print(f"❌ 哈希校验失败: {e}")
        return

    # 3. 读取学生名单
    try:
        with open(STUDENTS_FILE_PATH, "r", encoding="utf-8") as f:
            students = json.load(f)
        if not students:
            print("❌ students.json 为空。")
            return
        print(f"✅ 成功读取名单，共 {len(students)} 位同学。")
    except Exception as e:
        print(f"❌ 读取 students.json 失败: {e}")
        return

    # 4. 获取作业内容
    title, content = fetch_homework()
    if not title or not content:
        return

    # 5. 获取 access_token
    token_url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={APPID}&secret={SECRET}"
    token_res = requests.get(token_url).json()
    access_token = token_res.get("access_token")
    
    if not access_token:
        print("❌ 获取 access_token 失败:", token_res)
        return

    # 6. 遍历推送
    send_url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
    success_count = 0
    
    for index, student in enumerate(students):
        name = student.get("name", "未知")
        userid = student.get("userid")
        if not userid:
            continue

        data = {
            "touser": userid,
            "template_id": TEMPLATE_ID,
            "data": {
                "title": {"value": title},
                "content": {"value": content}
            }
        }
        
        res = requests.post(send_url, json=data).json()
        
        if res.get("errcode") == 0:
            print(f"✅ [{index+1}/{len(students)}] 推送给 {name} 成功")
            success_count += 1
        else:
            print(f"❌ [{index+1}/{len(students)}] 推送给 {name} 失败: {res}")
        
        time.sleep(1.5)

    # 7. 如果至少推送成功了一个人，记录本次哈希
    if success_count > 0:
        with open(HASH_FILE_PATH, "w") as f:
            f.write(current_hash)
        print(f"💾 哈希已更新，本次成功推送 {success_count} 人。")

if __name__ == "__main__":
    main()
